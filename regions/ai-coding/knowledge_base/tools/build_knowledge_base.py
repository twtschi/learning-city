#!/usr/bin/env python3
"""Build the AI Coding knowledge base.

Two independent outputs:

  web/   (committed)  notes/*.md  ->  web/catalog.js + web/notes/<id>.js
                      The UI reads ONLY this. Add or edit a note, rebuild, and the
                      course (chapters, weeks, progress totals) changes with it.

  rag/   (local only) source PDFs ->  rag/chunks.jsonl + rag/manifest.json
                      Raw book text for `search_kb.py`. Never shipped to the site.

Usage:
    python knowledge_base/tools/build_knowledge_base.py                 # both
    python knowledge_base/tools/build_knowledge_base.py --only web      # no PDFs needed
    python knowledge_base/tools/build_knowledge_base.py --source coding-with-ai=C:/path/book.pdf

A note is a Markdown file in notes/ with a small front matter block:

    ---
    id: book-prompt-basics       # unique, [a-z0-9-]
    title: Prompt 的基本功
    kind: lesson                 # lesson = its own chapter; deepdive = reading under another lesson
    week: 2
    order: 70
    attach: tokens               # deepdive only: a core lesson id or another note id
    minutes: 15
    source: coding-with-ai p.244-265   # optional citation, printed page numbers
    ---

Inside a note you can use fenced code blocks (```lang) and images. Images must live in
notes/figures/ and be referenced as ![caption](figures/name.svg); external URLs are rejected.
The build copies notes/figures/ to web/figures/.

Special sections inside a note:

    ## 檢查點                     one multiple-choice question (exactly one [x])
    Q: ...
    - [ ] wrong
    - [x] right
    解釋: ...

    ## 思考練習                   a practice question with reference points
    Q: ...
    - point
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

KB_DIR = Path(__file__).resolve().parents[1]
NOTES_DIR = KB_DIR / "notes"
FIGURES_DIR = NOTES_DIR / "figures"
WEB_DIR = KB_DIR / "web"
RAG_DIR = KB_DIR / "rag"
SOURCES_JSON = KB_DIR / "sources.json"
SOURCES_LOCAL = KB_DIR / "sources.local.json"
SOURCES_DROP = KB_DIR / "sources"
COURSE_JSON = KB_DIR / "course.json"

KINDS = {"lesson", "deepdive"}


class BuildError(Exception):
    pass


# ----------------------------------------------------------------- notes -> web


def parse_front_matter(text: str, name: str) -> tuple[dict, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not match:
        raise BuildError(f"{name}: missing front matter block")
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        line = re.sub(r"\s+#.*$", "", line).strip()
        if not line:
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise BuildError(f"{name}: bad front matter line {line!r}")
        meta[key.strip()] = value.strip()
    return meta, match.group(2)


def split_special_sections(body: str) -> tuple[str, str | None, str | None]:
    """Return (main body, checkpoint block, drill block)."""
    parts = re.split(r"^##\s+(檢查點|思考練習)\s*$", body, flags=re.M)
    main, special = parts[0].strip(), {}
    for i in range(1, len(parts), 2):
        special[parts[i]] = parts[i + 1].strip()
    return main, special.get("檢查點"), special.get("思考練習")


def parse_checkpoint(block: str, name: str) -> dict:
    q = re.search(r"^Q:\s*(.+)$", block, re.M)
    options = re.findall(r"^-\s*\[( |x)\]\s*(.+)$", block, re.M)
    explain = re.search(r"^解釋:\s*(.+?)\s*\Z", block, re.M | re.S)
    if not q or len(options) < 2:
        raise BuildError(f"{name}: 檢查點 needs 'Q:' and at least two '- [ ]' options")
    if sum(1 for flag, _ in options if flag == "x") != 1:
        raise BuildError(f"{name}: 檢查點 must mark exactly one option with [x]")
    if not explain:
        raise BuildError(f"{name}: 檢查點 needs an '解釋:' line")
    return {"q": q.group(1).strip(), "options": [[text.strip(), 1 if flag == "x" else 0] for flag, text in options], "explain": " ".join(explain.group(1).split())}


def parse_drill(block: str, name: str) -> dict:
    q = re.search(r"^Q:\s*(.+)$", block, re.M)
    refs = [m.strip() for m in re.findall(r"^-\s+(.+)$", block, re.M)]
    if not q or not refs:
        raise BuildError(f"{name}: 思考練習 needs 'Q:' and at least one '- ' point")
    return {"q": q.group(1).strip(), "ref": refs}


def parse_source_ref(value: str, sources: dict[str, dict], name: str) -> dict | None:
    if not value:
        return None
    match = re.fullmatch(r"([a-z0-9-]+)(?:\s+p\.(\d+)(?:\s*[-–]\s*(\d+))?)?", value)
    if not match:
        raise BuildError(f"{name}: bad source {value!r} (expected 'source-id p.8-15')")
    sid, a, b = match.group(1), match.group(2), match.group(3)
    if sid not in sources:
        raise BuildError(f"{name}: unknown source id {sid!r} (see sources.json)")
    ref: dict = {"id": sid}
    if a:
        lo, hi = int(a), int(b or a)
        first, last = sources[sid]["printed_pages"]
        if not (first <= lo <= hi <= last):
            raise BuildError(f"{name}: pages {lo}-{hi} outside {sid} printed range {first}-{last}")
        ref["pages"] = [lo, hi]
    return ref


def load_notes(sources: dict[str, dict], core_lessons: list[str]) -> list[dict]:
    notes, seen = [], set()
    for path in sorted(NOTES_DIR.glob("*.md")):
        name = path.name
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"), name)
        nid = meta.get("id", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", nid):
            raise BuildError(f"{name}: id must match [a-z0-9][a-z0-9-]*")
        if nid in seen or nid in core_lessons:
            raise BuildError(f"{name}: duplicate id {nid!r}")
        seen.add(nid)
        kind = meta.get("kind", "lesson")
        if kind not in KINDS:
            raise BuildError(f"{name}: kind must be one of {sorted(KINDS)}")
        try:
            week, order, minutes = int(meta.get("week", "1")), int(meta.get("order", "100")), int(meta.get("minutes", "10"))
        except ValueError as exc:
            raise BuildError(f"{name}: week/order/minutes must be integers") from exc
        if re.search(r"^##\s+面試演練", body, re.M):
            raise BuildError(f"{name}: '## 面試演練' was renamed to '## 思考練習'")
        main, checkpoint, drill = split_special_sections(body)
        if not main:
            raise BuildError(f"{name}: empty body")
        for alt, target in re.findall(r"!\[([^\]]*)\]\(([^)]*)\)", main):
            if not re.fullmatch(r"figures/[A-Za-z0-9_.-]+\.(svg|png|jpg|webp)", target):
                raise BuildError(f"{name}: image {target!r} must be figures/<file> (no external URLs)")
            if not (FIGURES_DIR / target.split("/", 1)[1]).is_file():
                raise BuildError(f"{name}: image {target!r} not found in notes/figures/")
            if not alt.strip():
                raise BuildError(f"{name}: image {target!r} needs a caption (alt text)")
        note = {
            "id": nid, "title": meta.get("title", nid), "kind": kind, "week": week, "order": order,
            "minutes": minutes, "attach": meta.get("attach") or None,
            "source": parse_source_ref(meta.get("source", ""), sources, name),
            "body": main,
            "quiz": parse_checkpoint(checkpoint, name) if checkpoint else None,
            "practice": parse_drill(drill, name) if drill else None,
            "_file": name,
        }
        if kind == "deepdive" and not note["attach"]:
            raise BuildError(f"{name}: a deepdive needs 'attach:'")
        notes.append(note)
    ids = seen | set(core_lessons)
    for n in notes:
        if n["attach"] and n["attach"] not in ids:
            raise BuildError(f"{n['_file']}: attach target {n['attach']!r} does not exist")
        if n["attach"] and n["kind"] == "lesson":
            raise BuildError(f"{n['_file']}: only a deepdive can use 'attach:'")
    return notes


def js_literal(obj: object) -> str:
    text = json.dumps(obj, ensure_ascii=False, indent=1)
    return text.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def write_web(notes: list[dict], sources: list[dict], course: dict) -> None:
    out_notes = WEB_DIR / "notes"
    if out_notes.exists():
        shutil.rmtree(out_notes)
    out_notes.mkdir(parents=True)
    header = "// Generated by knowledge_base/tools/build_knowledge_base.py - do not edit by hand.\n"
    out_figs = WEB_DIR / "figures"
    if out_figs.exists():
        shutil.rmtree(out_figs)
    if FIGURES_DIR.is_dir():
        shutil.copytree(FIGURES_DIR, out_figs)
    index = []
    for n in notes:
        payload = {k: v for k, v in n.items() if not k.startswith("_")}
        (out_notes / f"{n['id']}.js").write_text(f"{header}LC.defineNote({js_literal(payload)});\n", encoding="utf-8")
        index.append({k: n[k] for k in ("id", "title", "kind", "week", "order", "minutes", "attach", "source")} | {"file": f"notes/{n['id']}.js"})
    catalog = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "weeks": course["weeks"],
        "core_lessons": course["core_lessons"],
        "sources": [{k: s.get(k) for k in ("id", "title", "author", "publisher", "year")} for s in sources],
        "notes": index,
    }
    (WEB_DIR / "catalog.js").write_text(f"{header}LC.registerCatalog({js_literal(catalog)});\n", encoding="utf-8")
    lessons = sum(1 for n in notes if n["kind"] == "lesson")
    print(f"web: {len(notes)} notes ({lessons} lessons, {len(notes) - lessons} deepdives) -> web/catalog.js")


# ---------------------------------------------------------------- sources -> rag


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def resolve_source_path(source: dict, overrides: dict[str, str], local: dict[str, str]) -> Path | None:
    for candidate in (overrides.get(source["id"]), local.get(source["id"])):
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    if SOURCES_DROP.is_dir():
        found = sorted(SOURCES_DROP.glob(source["file_glob"]))
        if found:
            return found[0]
    return None


def pdf_pages(path: Path) -> list[str]:
    try:
        from pypdf import PdfReader  # type: ignore

        return [(page.extract_text() or "") for page in PdfReader(str(path)).pages]
    except ImportError:
        pass
    binary = shutil.which("pdftotext")
    if not binary:
        raise BuildError("No PDF backend. Install one:  pip install pypdf   (or poppler's pdftotext)")
    result = subprocess.run([binary, "-enc", "UTF-8", str(path), "-"], capture_output=True, check=True)
    pages = result.stdout.decode("utf-8", errors="replace").split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def clean_page(text: str) -> list[str]:
    text = unicodedata.normalize("NFC", text).replace("\u00a0", " ").replace("\u00ad", "").replace("\ufffd", "'")
    lines = [ln.strip() for ln in text.splitlines()]
    # drop bare page numbers and the "Chapter N Title" running header
    lines = [ln for ln in lines if ln and not re.fullmatch(r"\d{1,3}", ln) and not re.match(r"^Chapter \d+\s{1,3}\S", ln)]
    return lines


def chunk_page(lines: list[str], max_chars: int = 900) -> list[str]:
    chunks, buf, size = [], [], 0
    for ln in lines:
        if size + len(ln) > max_chars and buf:
            chunks.append(" ".join(buf))
            buf, size = [], 0
        buf.append(ln)
        size += len(ln) + 1
    if buf:
        chunks.append(" ".join(buf))
    return [c for c in chunks if len(c) >= 40]


def chapter_of(source: dict, printed: int) -> str | None:
    for ch in source["chapters"]:
        if ch["pages"][0] <= printed <= ch["pages"][1]:
            return ch["id"]
    return None


def build_rag_for(source: dict, path: Path) -> list[dict]:
    pages = pdf_pages(path)
    offset = source["page_offset"]
    first, last = source["printed_pages"]
    records = []
    for pdf_index, text in enumerate(pages, start=1):
        printed = pdf_index - offset
        if not (first <= printed <= last):
            continue  # front matter and index are not indexed
        for n, chunk in enumerate(chunk_page(clean_page(text)), start=1):
            records.append({
                "id": f"{source['id']}:p{printed}:{n}", "source": source["id"], "chapter": chapter_of(source, printed),
                "page": printed, "text": chunk, "sha1": hashlib.sha1(chunk.encode("utf-8")).hexdigest()[:12],
            })
    return records


def build_rag(sources: list[dict], overrides: dict[str, str]) -> None:
    local = json.loads(SOURCES_LOCAL.read_text(encoding="utf-8")) if SOURCES_LOCAL.exists() else {}
    RAG_DIR.mkdir(exist_ok=True)
    all_records, manifest_sources = [], []
    for source in sources:
        path = resolve_source_path(source, overrides, local)
        if not path:
            print(f"rag: {source['id']}: PDF not found, skipped (pass --source {source['id']}=PATH)")
            continue
        records = build_rag_for(source, path)
        if not records:
            raise BuildError(f"{source['id']}: no text extracted (scanned PDF? this tool does not OCR)")
        local[source["id"]] = str(path)
        all_records += records
        manifest_sources.append({"id": source["id"], "file": path.name, "sha256": sha256(path), "chunks": len(records),
                                 "pages": sorted({r["page"] for r in records})[:1] + sorted({r["page"] for r in records})[-1:]})
        print(f"rag: {source['id']}: {len(records)} chunks from {path.name}")
    if not all_records:
        return
    with (RAG_DIR / "chunks.jsonl").open("w", encoding="utf-8") as handle:
        for rec in all_records:
            handle.write(json.dumps(rec, ensure_ascii=False) + "\n")
    manifest = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "format": "JSON Lines; one chunk per line",
                "record_count": len(all_records), "sources": manifest_sources,
                "note": "Local only (gitignored). Contains raw source text; do not publish."}
    (RAG_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    SOURCES_LOCAL.write_text(json.dumps(local, ensure_ascii=False, indent=1), encoding="utf-8")


# ------------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", choices=["web", "rag"], help="build just one output")
    ap.add_argument("--source", action="append", default=[], metavar="ID=PATH", help="location of a source PDF (remembered in sources.local.json)")
    args = ap.parse_args()
    overrides = dict(item.split("=", 1) for item in args.source if "=" in item)

    try:
        registry = json.loads(SOURCES_JSON.read_text(encoding="utf-8"))["sources"]
        course = json.loads(COURSE_JSON.read_text(encoding="utf-8"))
        if args.only != "rag":
            notes = load_notes({s["id"]: s for s in registry}, course["core_lessons"])
            notes.sort(key=lambda n: (n["week"], n["order"], n["id"]))
            write_web(notes, registry, course)
        if args.only != "web":
            build_rag(registry, overrides)
    except BuildError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
