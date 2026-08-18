"""Build the portable JSONL retrieval index from the two source PDFs and notes."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from itertools import chain
from pathlib import Path

from pypdf import PdfReader


KB_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = KB_DIR.parent
RAG_DIR = KB_DIR / "rag"
BOOK_PATH = next(SOURCE_DIR.glob("Mike Jackson*.pdf"))
BLUEPRINT_PATH = SOURCE_DIR / "PCIe_3.0_Architecture_Blueprint.pdf"

BLUEPRINT_PAGES = [
    (1, "PCIe 3.0 架構與協定疊總覽", "知識藍圖封面。以介面與 trace routing blueprint 為視覺中心，標示 Transaction Layer、Data Link Layer、Physical Layer 及系統端點。", ["overview", "layers"]),
    (2, "從平行匯流排到序列點對點", "比較 PCI/PCI-X 的共享平行匯流排、共同 clock、仲裁與頻寬共享，和 PCI Express 的專用 serial link、embedded clock、differential signaling 與可擴展 lane width。", ["PCI", "serial", "differential"]),
    (3, "PCIe 系統拓撲", "展示 CPU/Memory、Root Complex、Switch、Bridge、Endpoint 的倒樹狀 switched fabric。Switch 提供 fan-out，Bridge 連接舊匯流排，Endpoint 是最終功能。", ["topology", "root complex", "switch", "endpoint"]),
    (4, "三層協定封裝", "Transaction Layer 組裝 TLP 並負責交易/路由/QoS；Data Link Layer 加 Sequence Number 與 LCRC、處理 Ack/Nak；Physical Layer framing、encoding、scrambling、striping 並送上 serial bitstream。", ["transaction layer", "data link layer", "physical layer"]),
    (5, "TLP 封包與交易類型", "TLP 由 12/16-byte Header、0-4096-byte optional payload、optional 4-byte ECRC 組成。Non-Posted Request 需要 Completion；Posted Request 如 Memory Write 不等待 Completion。", ["TLP", "posted", "non-posted", "completion"]),
    (6, "三種 TLP 路由", "Address Routing 用於 Memory/I/O，依 address 與 BAR/Base-Limit window；ID Routing 用 BDF，常用於 Configuration 與 Completion；Implicit Routing 用預設拓撲方向，常用於 Message。", ["address routing", "ID routing", "implicit routing"]),
    (7, "QoS 與 Virtual Channel", "Traffic Class 經 TC-to-VC Mapping 映射到 Virtual Channel。各 VC 具有 Flow Control 資源，並由 strict priority 或 weighted round-robin 等 arbitration 共用 physical link。", ["QoS", "TC", "VC", "arbitration"]),
    (8, "Credit-Based Flow Control", "Receiver 先公告 buffer credits，Transmitter 只在 credit 足夠時送 TLP；Receiver 釋放 buffer 後以 FC_Update DLLP 更新。此機制避免 PCI retry/disconnect 與 buffer overflow。", ["flow control", "credit", "FC_Update"]),
    (9, "Data Link 封裝與 DLLP", "每個 TLP 在單一 Link 加上 Sequence Number 與 4-byte LCRC。DLLP 是獨立 8-byte link-local packet，承載 Ack/Nak、Flow Control 與 Power Management 等。", ["sequence number", "LCRC", "DLLP"]),
    (10, "Ack/Nak 與 Replay", "Transmitter 把未確認 TLP 保存在 Replay Buffer；Receiver 驗證 LCRC/Sequence，成功回 Ack、錯誤回 Nak；Nak 或 timeout 觸發 replay，形成逐跳可靠性迴路。", ["Ack", "Nak", "replay buffer"]),
    (11, "Transaction Ordering", "以 Producer/Consumer 說明 data write、flag write、read completion 的排序需求；同時指出 Relaxed Ordering 與 ID-Based Ordering 可在無資料相依時改善效能。", ["ordering", "producer consumer", "relaxed ordering", "IDO"]),
    (12, "Physical Logical Pipeline", "展示 byte striping 把 packet bytes 分到 x4/x8/x16 lanes，並以 scrambling 改善 transition density/頻譜；接收端做逆向還原。", ["byte striping", "scrambling", "lane"]),
    (13, "Gen1/2 與 Gen3 編碼", "Gen1/2 的 8b/10b 約有 20% 編碼 overhead；Gen3 的 128b/130b 約 1.5%，以 8.0 GT/s 達到接近 1 GB/s/lane/direction 的有效資料率。", ["8b/10b", "128b/130b", "Gen3"]),
    (14, "系統除錯與驗證", "以 MindShare Arbor 為例，將 Configuration Space 視覺化並執行規則檢查，協助把 hex register dump 轉為具體違規與分析結果。", ["debug", "validation", "configuration space"]),
    (15, "Memory Read 端到端跨層流程", "由核心提出 Memory Read Request，Transaction Layer 組 TLP，Data Link 加 Sequence/LCRC，Physical Layer 編碼傳送；Switch 驗證並依 address routing 轉送，Completer 回 Completion with Data。", ["memory read", "end-to-end", "completion"]),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_pdf_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u00a0", " ").replace("\u00ad", "")
    text = re.sub(r"(?<=\w)[\-‐‑–]\s*\n\s*(?=\w)", "", text)
    lines = []
    for line in text.splitlines():
        value = line.strip()
        if not value:
            continue
        if re.search(r"PCIe\s*3\.0\.book\s+Page", value, re.I):
            continue
        if len(lines) == 0 and re.fullmatch(r"\d{1,4}", value):
            continue
        lines.append(value)
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def split_words(text: str, target: int = 260, overlap: int = 40):
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(len(words), start + target)
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = max(start + 1, end - overlap)
    return chunks


def flatten_outline(reader: PdfReader, nodes, level: int = 0):
    rows = []
    for node in nodes:
        if isinstance(node, list):
            rows.extend(flatten_outline(reader, node, level + 1))
            continue
        title = getattr(node, "title", str(node)).strip()
        try:
            page = reader.get_destination_page_number(node) + 1
        except Exception:
            page = None
        if page:
            rows.append({"level": level, "title": title, "pdf_page": page})
    return rows


def outline_context(outline, pdf_page: int):
    part = "Front Matter"
    chapter = "Front Matter"
    section = ""
    for row in outline:
        if row["pdf_page"] > pdf_page:
            continue
        title = row["title"]
        if title.startswith("Part "):
            part = title
        if title.startswith(("Chapter ", "Appendix ", "Glossary", "Index")):
            chapter = title
        section = title
    return part, chapter, section


def book_records():
    reader = PdfReader(str(BOOK_PATH))
    outline = flatten_outline(reader, reader.outline)
    for page_no, page in enumerate(reader.pages, start=1):
        text = clean_pdf_text(page.extract_text() or "")
        part, chapter, section = outline_context(outline, page_no)
        for chunk_no, content in enumerate(split_words(text), start=1):
            yield {
                "id": f"BOOK-p{page_no:04d}-c{chunk_no:02d}",
                "source_id": "BOOK",
                "source_file": BOOK_PATH.name,
                "content_kind": "source_text",
                "pdf_page": page_no,
                "part": part,
                "chapter": chapter,
                "section": section,
                "title": section or chapter,
                "tags": ["PCIe 3.0", "MindShare"],
                "content": content,
            }


def blueprint_records():
    for page_no, title, content, tags in BLUEPRINT_PAGES:
        yield {
            "id": f"BP-p{page_no:02d}",
            "source_id": "BP",
            "source_file": BLUEPRINT_PATH.name,
            "content_kind": "visual_summary",
            "pdf_page": page_no,
            "part": "Architecture Blueprint",
            "chapter": title,
            "section": title,
            "title": title,
            "tags": ["PCIe 3.0", *tags],
            "content": content,
        }


def note_records():
    for path in sorted(KB_DIR.glob("[0-9][0-9]_*.md")):
        title = path.stem
        heading = title
        buffer = []
        index = 0

        def emit():
            nonlocal index, buffer
            content = re.sub(r"\s+", " ", "\n".join(buffer)).strip()
            buffer = []
            if not content:
                return None
            index += 1
            return {
                "id": f"NOTE-{path.stem}-c{index:03d}",
                "source_id": "KB_NOTE",
                "source_file": path.name,
                "content_kind": "curated_note",
                "pdf_page": None,
                "part": "Curated Knowledge Base",
                "chapter": title,
                "section": heading,
                "title": heading,
                "tags": ["中文", "curated", "PCIe 3.0"],
                "content": content,
            }

        for line in path.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^(#{1,4})\s+(.+)$", line)
            if match:
                record = emit()
                if record:
                    yield record
                heading = match.group(2).strip()
            else:
                buffer.append(line)
        record = emit()
        if record:
            yield record


def main():
    RAG_DIR.mkdir(parents=True, exist_ok=True)
    output = RAG_DIR / "pcie3_chunks.jsonl"
    counts = {"BOOK": 0, "BP": 0, "KB_NOTE": 0}
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        for record in chain(book_records(), blueprint_records(), note_records()):
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            counts[record["source_id"]] += 1

    manifest = {
        "name": "PCI Express 3.0 Knowledge Base",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "format": "JSON Lines; one retrieval chunk per line",
        "record_count": sum(counts.values()),
        "counts_by_source": counts,
        "sources": [
            {"id": "BOOK", "file": BOOK_PATH.name, "pages": 1057, "sha256": sha256(BOOK_PATH)},
            {"id": "BP", "file": BLUEPRINT_PATH.name, "pages": 15, "sha256": sha256(BLUEPRINT_PATH)},
        ],
        "schema": {
            "id": "stable chunk id",
            "source_id": "BOOK, BP, or KB_NOTE",
            "source_file": "originating filename",
            "content_kind": "source_text, visual_summary, or curated_note",
            "pdf_page": "1-based physical PDF page when applicable",
            "part": "book part or knowledge-base collection",
            "chapter": "chapter title",
            "section": "nearest outline or note heading",
            "title": "display title",
            "tags": "retrieval hints",
            "content": "UTF-8 text",
        },
    }
    (RAG_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
