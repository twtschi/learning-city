#!/usr/bin/env python3
"""Build the AI Coding chapter videos: script -> slides + narration -> MP4 + WebVTT.

    python regions/ai-coding/videos/tools/build_videos.py --model <kokoro dir> [ids...]
    python regions/ai-coding/videos/tools/build_videos.py --model <kokoro dir> --asr <sense-voice dir> tokens

Inputs (committed):
  videos/scripts/<id>.txt          one script per chapter (format below)
  videos/tools/pronunciations.tsv  how terms are spoken (subtitles keep the written form)
  videos/tools/render_slides.mjs   slide renderer (Node + Playwright + Chromium)

Outputs (committed, served by the site):
  videos/<id>.mp4  videos/<id>.vtt  videos/<id>.jpg  videos/<id>.json  videos/manifest.js

Needs: Python 3.11+, numpy, sherpa-onnx, opencc-python-reimplemented, ffmpeg, Node.js + playwright.
TTS model: sherpa-onnx "kokoro-int8-multi-lang-v1_1" (GitHub releases of k2-fsa/sherpa-onnx, tts-models).
Optional QA model: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17" (asr-models): every sentence is
transcribed back and compared with the narration; the character error rate goes into <id>.json.

Script format:

    id: tokens
    title: Token 與 Context Window
    week: WEEK 01 · 互動章節

    === title                 slide types: title big bullets steps compare table figure code quiz end
    heading: ...
    sub: ...
    > 旁白，可以寫很多行，每行開頭是「> 」。

    === bullets
    heading: ...
    - 項目
    note: 補充說明
    > ...

    compare: "col: 標題" starts a column, "- " items follow. table: "| a | b |" rows (first row = header).
    figure: "src: name.svg" (from knowledge_base/notes/figures), "caption: ...".
    code: a fenced block (```lang ... ```). quiz: "q: ...", options "- ...", the right one "- * ...".
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

VIDEOS = Path(__file__).resolve().parents[1]
SCRIPTS = VIDEOS / "scripts"
TOOLS = VIDEOS / "tools"
FIGURES = VIDEOS.parent / "knowledge_base" / "notes" / "figures"
CACHE = VIDEOS / ".cache"
FIELDS = {"heading", "sub", "note", "src", "caption", "q", "text", "next", "lang"}

LEAD, GAP, TAIL = 0.35, 0.32, 0.75        # seconds of silence: before a slide, between sentences, after a slide
CUE_MAX = 30                              # max characters per subtitle cue


class ScriptError(Exception):
    pass


# ------------------------------------------------------------------ script parsing

def parse_script(path: Path) -> dict:
    meta, slides, cur, fence = {}, [], None, None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if fence is not None:
            if line.startswith("```"):
                cur["code"] = "\n".join(fence)
                fence = None
            else:
                fence.append(raw)
            continue
        if line.startswith("=== "):
            cur = {"type": line[4:].strip(), "say": [], "items": []}
            slides.append(cur)
            continue
        if not line.strip():
            continue
        if cur is None:
            key, _, val = line.partition(":")
            meta[key.strip()] = val.strip()
            continue
        if line.startswith("```"):
            cur["lang"] = line[3:].strip() or "text"
            fence = []
        elif line.startswith("> "):
            cur["say"].append(line[2:].strip())
        elif line.startswith("- "):
            item = line[2:].strip()
            if cur["type"] == "quiz":
                cur.setdefault("options", []).append({"text": item[2:].strip() if item.startswith("* ") else item, "ok": item.startswith("* ")})
            elif cur["type"] == "compare":
                if not cur.get("columns"):
                    raise ScriptError(f"{path.name}: compare item before any 'col:'")
                cur["columns"][-1]["items"].append(item)
            else:
                cur["items"].append(item)
        elif line.startswith("|"):
            cur.setdefault("rows", []).append([c.strip() for c in line.strip().strip("|").split("|")])
        elif line.startswith("col:"):
            cur.setdefault("columns", []).append({"title": line[4:].strip(), "items": []})
        else:
            key, sep, val = line.partition(":")
            if not sep or key.strip() not in FIELDS:
                raise ScriptError(f"{path.name}: cannot parse line {line!r}")
            cur[key.strip()] = val.strip()
    for k in ("id", "title", "week"):
        if k not in meta:
            raise ScriptError(f"{path.name}: missing '{k}:'")
    for i, s in enumerate(slides, 1):
        s["say"] = "".join(s["say"])
        if not s["say"]:
            raise ScriptError(f"{path.name}: slide {i} ({s['type']}) has no narration")
        if s["type"] == "figure" and not (FIGURES / s.get("src", "")).is_file():
            raise ScriptError(f"{path.name}: slide {i}: figure {s.get('src')!r} not found")
        if s["type"] == "quiz" and sum(o["ok"] for o in s.get("options", [])) != 1:
            raise ScriptError(f"{path.name}: slide {i}: quiz needs exactly one '- * ' option")
    return {**meta, "slides": slides}


# ------------------------------------------------------------------ text -> speech

def load_pronunciations() -> list[tuple[re.Pattern, str]]:
    rules = []
    for line in (TOOLS / "pronunciations.tsv").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        written, spoken = line.split("\t")
        rules.append((written, spoken))
    rules.sort(key=lambda r: -len(r[0]))
    return [(re.compile(rf"(?<![A-Za-z]){re.escape(w)}(?![A-Za-z])", re.I), s) for w, s in rules]


def sentences(text: str) -> list[str]:
    return [p.strip() for p in re.findall(r"[^。！？；]+[。！？；]?", text) if p.strip()]


class Speaker:
    def __init__(self, model_dir: str, sid: int, speed: float, threads: int = 4):
        import opencc
        import sherpa_onnx
        d = model_dir
        self.t2s = opencc.OpenCC("t2s")
        self.rules = load_pronunciations()
        self.sid, self.speed, self.model_dir = sid, speed, d
        self.tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=f"{d}/model.int8.onnx", voices=f"{d}/voices.bin", tokens=f"{d}/tokens.txt",
                    data_dir=f"{d}/espeak-ng-data", dict_dir=f"{d}/dict",
                    lexicon=f"{d}/lexicon-us-en.txt,{d}/lexicon-zh.txt"),
                num_threads=threads),
            rule_fsts=f"{d}/phone-zh.fst,{d}/date-zh.fst,{d}/number-zh.fst", max_num_sentences=1))
        self.rate = self.tts.sample_rate

    def spoken(self, sentence: str) -> str:
        s = sentence
        for pat, rep in self.rules:
            s = pat.sub(rep, s)
        s = re.sub(r"[「」『』《》〈〉“”\"*`]", "", s)
        s = re.sub(r"[，、：（）—…／/]+", "，", s)
        s = re.sub(r"[。！？；]+", "", s)
        return self.t2s.convert(s).strip("， ")

    def say(self, sentence: str) -> np.ndarray:
        text = self.spoken(sentence)
        key = hashlib.sha1(f"{self.model_dir}|{self.sid}|{self.speed}|{text}".encode()).hexdigest()
        path = CACHE / "tts" / f"{key}.npy"
        if path.exists():
            return np.load(path)
        audio = np.array(self.tts.generate(text, sid=self.sid, speed=self.speed).samples, dtype=np.float32)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, audio)
        return audio


# ------------------------------------------------------------------ QA: transcribe narration back

class Checker:
    def __init__(self, asr_dir: str):
        import opencc
        import sherpa_onnx
        self.t2s = opencc.OpenCC("t2s")
        self.rec = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=f"{asr_dir}/model.int8.onnx", tokens=f"{asr_dir}/tokens.txt", language="zh", use_itn=False, num_threads=4)

    def norm(self, s: str) -> str:
        return re.sub(r"[^\w]", "", self.t2s.convert(s)).lower()

    def cer(self, ref: str, hyp: str) -> float:
        r, h = self.norm(ref), self.norm(hyp)
        d = list(range(len(h) + 1))
        for i, rc in enumerate(r, 1):
            prev, d[0] = d[0], i
            for j, hc in enumerate(h, 1):
                prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (rc != hc))
        return d[len(h)] / max(len(r), 1)

    def transcribe(self, audio: np.ndarray, rate: int) -> str:
        s = self.rec.create_stream()
        s.accept_waveform(rate, audio)
        self.rec.decode_stream(s)
        return s.result.text

    def check(self, speaker: "Speaker", sentence: str, audio: np.ndarray) -> dict:
        said, heard = speaker.spoken(sentence), self.transcribe(audio, speaker.rate)
        return {"text": sentence, "spoken": said, "heard": heard, "cer": round(self.cer(said, heard), 3)}


# ------------------------------------------------------------------ subtitles

def cue_chunks(sentence: str) -> list[str]:
    if len(sentence) <= CUE_MAX:
        return [sentence]
    parts, buf = [], ""
    for piece in re.findall(r"[^，、：]+[，、：]?", sentence):
        if buf and len(buf) + len(piece) > CUE_MAX:
            parts.append(buf)
            buf = ""
        buf += piece
    if buf:
        parts.append(buf)
    out = []
    for p in parts:                        # still too long (no commas): hard wrap
        out += [p[i:i + CUE_MAX] for i in range(0, len(p), CUE_MAX)]
    return out


def ts(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


# ------------------------------------------------------------------ build one chapter

def build(script: Path, speaker: Speaker, checker: Checker | None, args) -> dict:
    spec = parse_script(script)
    vid = spec["id"]
    rate = speaker.rate
    audio, cues, durations, qa = [], [], [], []
    t = 0.0
    for slide in spec["slides"]:
        start = t
        audio.append(np.zeros(int(LEAD * rate), np.float32))
        t += LEAD
        for k, sent in enumerate(sentences(slide["say"])):
            if k:
                audio.append(np.zeros(int(GAP * rate), np.float32))
                t += GAP
            x = speaker.say(sent)
            dur = len(x) / rate
            chunks = cue_chunks(sent)
            total = sum(len(c) for c in chunks)
            c0 = t
            for c in chunks:
                c1 = c0 + dur * len(c) / total
                cues.append((c0, c1, c))
                c0 = c1
            if checker:
                qa.append(checker.check(speaker, sent, x))
            audio.append(x)
            t += dur
        audio.append(np.zeros(int(TAIL * rate), np.float32))
        t += TAIL
        durations.append(t - start)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        slides_json = tmp / "slides.json"
        slides_json.write_text(json.dumps({
            "title": spec["title"], "week": spec["week"], "kicker": spec["week"], "figuresDir": str(FIGURES),
            "fontCss": args.font_css, "slides": spec["slides"]}, ensure_ascii=False), encoding="utf-8")
        env = dict(os.environ)
        if args.playwright:
            env["PLAYWRIGHT_MODULE"] = args.playwright
        if args.chromium:
            env["CHROMIUM_PATH"] = args.chromium
        r = subprocess.run(["node", str(TOOLS / "render_slides.mjs"), str(slides_json), str(tmp / "png")], capture_output=True, text=True, env=env)
        if r.returncode:
            raise ScriptError(f"{vid}: slide render failed: {r.stderr[-800:]}")
        if r.stderr.strip():
            print(f"  {vid}: {r.stderr.strip()}")
        wav = tmp / "voice.wav"
        pcm = np.clip(np.concatenate(audio), -1, 1)
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes((pcm * 32767).astype(np.int16).tobytes())
        lst = tmp / "list.txt"
        pngs = sorted((tmp / "png").glob("slide-*.png"))
        lines = []
        for png, d in zip(pngs, durations):
            lines += [f"file '{png}'", f"duration {d:.3f}"]
        lines.append(f"file '{pngs[-1]}'")
        lst.write_text("\n".join(lines) + "\n", encoding="utf-8")
        vtt = VIDEOS / f"{vid}.vtt"
        vtt.write_text("WEBVTT\n\n" + "\n\n".join(f"{i}\n{ts(a)} --> {ts(b)}\n{c}" for i, (a, b, c) in enumerate(cues, 1)) + "\n", encoding="utf-8")
        mp4 = VIDEOS / f"{vid}.mp4"
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(wav), "-i", str(vtt),
               "-map", "0:v", "-map", "1:a", "-map", "2:s",
               "-vf", "fps=12,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage", "-crf", "30",
               "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "56k", "-ac", "1", "-ar", "24000",
               "-c:s", "mov_text", "-metadata:s:s:0", "language=chi", "-metadata", f"title={spec['title']}",
               "-movflags", "+faststart", "-shortest", str(mp4)]
        subprocess.run(cmd, check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(pngs[0]), "-q:v", "4", str(VIDEOS / f"{vid}.jpg")], check=True)
    seconds = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp4)],
                                   capture_output=True, text=True, check=True).stdout)
    info = {"id": vid, "title": spec["title"], "seconds": round(seconds, 1), "slides": len(spec["slides"]),
            "characters": sum(len(s["say"]) for s in spec["slides"]), "bytes": mp4.stat().st_size}
    if qa:
        add_qa(info, qa)
    (VIDEOS / f"{vid}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    return info


def add_qa(info: dict, qa: list[dict]) -> None:
    info["asr_cer"] = round(float(np.mean([q["cer"] for q in qa])), 3)
    info["worst"] = sorted(qa, key=lambda q: -q["cer"])[:5]


def recheck(script: Path, speaker: Speaker, checker: Checker) -> dict:
    """Redo only the transcription check of a built video (audio comes from the TTS cache)."""
    spec = parse_script(script)
    path = VIDEOS / f"{spec['id']}.json"
    info = json.loads(path.read_text(encoding="utf-8"))
    add_qa(info, [checker.check(speaker, s, speaker.say(s)) for slide in spec["slides"] for s in sentences(slide["say"])])
    path.write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    return info


def write_manifest() -> None:
    entries = {}
    for meta in sorted(VIDEOS.glob("*.json")):
        info = json.loads(meta.read_text(encoding="utf-8"))
        vid = info["id"]
        if (VIDEOS / f"{vid}.mp4").exists():
            entries[vid] = {"src": f"videos/{vid}.mp4", "vtt": f"videos/{vid}.vtt", "poster": f"videos/{vid}.jpg", "seconds": info["seconds"]}
    text = json.dumps(entries, ensure_ascii=False, indent=1)
    (VIDEOS / "manifest.js").write_text(
        "// Generated by videos/tools/build_videos.py - do not edit by hand.\n"
        f"(window.LC = window.LC || {{}}).videos = {text};\n", encoding="utf-8")
    print(f"manifest: {len(entries)} videos")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="chapter ids to build (default: every script)")
    ap.add_argument("--model", required=False, help="sherpa-onnx kokoro-int8-multi-lang-v1_1 directory")
    ap.add_argument("--asr", help="optional sense-voice directory for the transcription check")
    ap.add_argument("--sid", type=int, default=40, help="speaker id (default 40)")
    ap.add_argument("--speed", type=float, default=1.1)
    ap.add_argument("--font-css", action="append", default=[], help="CSS file(s) with @font-face rules (e.g. @fontsource 400.css)")
    ap.add_argument("--playwright", help="path to the playwright package if it is not resolvable from here")
    ap.add_argument("--chromium", help="Chromium executable for Playwright")
    ap.add_argument("--check-only", action="store_true", help="only parse the scripts")
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--qa-only", action="store_true", help="only redo the transcription check of built videos (needs --model and --asr)")
    args = ap.parse_args()
    if args.manifest_only:
        write_manifest()
        return 0
    scripts = [SCRIPTS / f"{i}.txt" for i in args.ids] if args.ids else sorted(SCRIPTS.glob("*.txt"))
    try:
        parsed = [parse_script(p) for p in scripts]
    except (ScriptError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if args.check_only:
        for s in parsed:
            print(f"{s['id']:32s} slides={len(s['slides']):2d} chars={sum(len(x['say']) for x in s['slides'])}")
        return 0
    if not args.model:
        print("error: --model is required", file=sys.stderr)
        return 1
    speaker = Speaker(args.model, args.sid, args.speed)
    checker = Checker(args.asr) if args.asr else None
    if args.qa_only:
        if not checker:
            print("error: --qa-only needs --asr", file=sys.stderr)
            return 1
        for p in scripts:
            if (VIDEOS / f"{p.stem}.json").exists():
                info = recheck(p, speaker, checker)
                print(f"{info['id']:32s} asr_cer={info['asr_cer']:.3f}", flush=True)
        return 0
    for p in scripts:
        info = build(p, speaker, checker, args)
        print(f"{info['id']:32s} {info['seconds']:6.1f}s  {info['bytes']/1e6:5.2f} MB  slides={info['slides']}"
              + (f"  asr_cer={info['asr_cer']:.3f}" if "asr_cer" in info else ""), flush=True)
    write_manifest()
    return 0


if __name__ == "__main__":
    sys.exit(main())
