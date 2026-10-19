#!/usr/bin/env python3
"""Build the AI Coding chapter videos: script -> slides + narration -> MP4 + WebVTT.

    OPENROUTER_API_KEY=... python regions/ai-coding/videos/tools/build_videos.py [ids...] [--asr <sense-voice dir>]
    python regions/ai-coding/videos/tools/build_videos.py --engine kokoro --model <kokoro dir> [ids...]

Voices:
  openrouter (default)  cloud TTS through OpenRouter's /audio/speech endpoint, one request per chapter; the
                        default is the free Fish Audio S2.1 Pro model with a deep male voice from the Fish
                        Audio voice library and a tag asking for a Taiwanese accent. Needs OPENROUTER_API_KEY,
                        curl and --asr (slide and sentence boundaries come from the recognizer's timestamps).
                        Responses are cached in .cache/, so rebuilding unchanged narration sends no request.
  kokoro                offline sherpa-onnx "kokoro-int8-multi-lang-v1_1" (k2-fsa/sherpa-onnx releases,
                        tts-models), one sentence at a time, English terms spoken via pronunciations.tsv.

Inputs (committed):
  videos/scripts/<id>.txt          one script per chapter (format below)
  videos/tools/pronunciations.tsv  how terms are spoken by the kokoro voice (subtitles keep the written form)
  videos/tools/render_slides.mjs   slide renderer (Node + Playwright + Chromium)

Outputs (committed, served by the site):
  videos/<id>.mp4  videos/<id>.vtt  videos/<id>.jpg  videos/<id>.json  videos/manifest.js

Needs: Python 3.11+, numpy, ffmpeg, Node.js + playwright; sherpa-onnx and opencc-python-reimplemented for
the kokoro voice and for the QA check.
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
import time
import wave
from pathlib import Path

import numpy as np

VIDEOS = Path(__file__).resolve().parents[1]
SCRIPTS = VIDEOS / "scripts"
TOOLS = VIDEOS / "tools"
FIGURES = VIDEOS.parent / "knowledge_base" / "notes" / "figures"
CACHE = VIDEOS / ".cache"
FIELDS = {"heading", "sub", "note", "src", "caption", "q", "text", "next", "lang"}

LEAD, GAP, TAIL = 0.5, 0.32, 1.2          # seconds of silence: before a slide, between sentences, after a slide
MAX_PAD = 2.0                             # most extra silence added per slide change to reach --min-seconds
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


def weight(text: str) -> float:
    """Rough speaking length: one per Chinese character or digit, a bit more per English word."""
    return max(1.0, len(re.findall(r"[\u3400-\u9fff\d]", text)) + 1.3 * len(re.findall(r"[A-Za-z]+", text)))


def trim(x: np.ndarray, rate: int, keep: float = 0.05) -> np.ndarray:
    """Cut leading and trailing silence, keeping `keep` seconds on each side."""
    env = np.abs(x)
    loud = np.flatnonzero(env > max(1e-4, 0.02 * np.percentile(env, 99)))
    if not len(loud):
        return x
    return x[max(0, loud[0] - int(keep * rate)):min(len(x), loud[-1] + int(keep * rate))]


def split_points(x: np.ndarray, rate: int, sents: list[str]) -> list[float]:
    """End time of each sentence inside one slide's audio: the expected position by speaking length,
    snapped to the nearest pause (a quiet stretch of at least 120 ms)."""
    total = len(x) / rate
    if len(sents) == 1:
        return [total]
    hop = int(0.01 * rate)
    frames = len(x) // hop
    rms = np.sqrt(np.mean(x[:frames * hop].reshape(frames, hop) ** 2, axis=1))
    quiet = rms < 0.06 * np.percentile(rms, 95)
    pauses, i = [], 0
    while i < frames:
        j = i
        while j < frames and quiet[j]:
            j += 1
        if j - i >= 12:
            pauses.append((i + j) / 2 * 0.01)
        i = max(j, i + 1)
    shares = np.cumsum([weight(s) for s in sents])[:-1] / sum(weight(s) for s in sents)
    ends, last = [], 0.0
    for share in shares:
        want = share * total
        near = [p for p in pauses if last < p < total and abs(p - want) < 2.0]
        last = min(near, key=lambda p: abs(p - want)) if near else want
        ends.append(last)
    return ends + [total]


def frame_rms(x: np.ndarray, rate: int) -> np.ndarray:
    hop = int(0.01 * rate)
    return np.sqrt(np.mean(x[:len(x) // hop * hop].reshape(-1, hop) ** 2, axis=1))


def timed_tokens(checker, x: np.ndarray, rate: int, max_len: float = 25.0) -> tuple[list[str], list[float]]:
    """Recognizer tokens with absolute start times. Long audio is cut at its quietest points into pieces of
    at most `max_len` seconds, because the recognizer works best on short utterances."""
    rms, hop = frame_rms(x, rate), int(0.01 * rate)
    cuts = [0]
    while len(x) - cuts[-1] > max_len * rate:
        lo, hi = (cuts[-1] + int(0.6 * max_len * rate)) // hop, (cuts[-1] + int(max_len * rate)) // hop
        cuts.append((lo + int(np.argmin(rms[lo:hi]))) * hop)
    cuts.append(len(x))
    tokens, times = [], []
    for a, b in zip(cuts, cuts[1:]):
        st = checker.rec.create_stream()
        st.accept_waveform(rate, x[a:b])
        checker.rec.decode_stream(st)
        tokens += st.result.tokens
        times += [a / rate + t for t in st.result.timestamps]
    return tokens, times


def asr_split(checker, x: np.ndarray, rate: int, sents: list[str]) -> list[float] | None:
    """End time of each sentence from the recognizer's token timestamps: the script text is aligned to the
    transcript, and each boundary goes to the quietest point between the two sentences. None if it can't align."""
    import difflib
    if len(sents) == 1:
        return [len(x) / rate]
    hyp, times = [], []
    for tok, t0 in zip(*timed_tokens(checker, x, rate)):
        for ch in checker.norm(tok):
            hyp.append(ch)
            times.append(t0)
    refs = [checker.norm(s) for s in sents]
    ref = "".join(refs)
    where = {}
    for a, b, n in difflib.SequenceMatcher(None, ref, "".join(hyp), autojunk=False).get_matching_blocks():
        where.update({a + k: b + k for k in range(n)})
    if len(where) < 0.6 * len(ref):
        return None
    rms = frame_rms(x, rate)
    ends, pos, last = [], 0, 0.0
    for r in refs[:-1]:
        pos += len(r)
        nxt = next((where[i] for i in range(pos, len(ref)) if i in where), None)
        prv = next((where[i] for i in range(pos - 1, -1, -1) if i in where), None)
        if nxt is None or prv is None:
            return None
        lo, hi = int((times[prv] + 0.12) * 100), int(times[nxt] * 100)
        cut = (lo + int(np.argmin(rms[lo:hi]))) / 100 if 0 <= lo < hi <= len(rms) else times[nxt] - 0.05
        if cut <= last:
            return None
        ends.append(cut)
        last = cut
    return ends + [len(x) / rate]


class Speaker:
    unit = "sentence"

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

    def describe(self) -> str:
        return f"kokoro {Path(self.model_dir).name} sid={self.sid} speed={self.speed}"


class OpenRouterSpeaker:
    """Cloud TTS through OpenRouter. Consecutive slides are sent together, up to `max_chars` characters per
    request (a whole chapter by default): fewer requests, one consistent take, connected intonation."""
    unit = "group"
    rate = 24000
    API = "https://openrouter.ai/api/v1/audio/speech"

    def __init__(self, model: str, voice: str, prefix: str, max_chars: int, speed: float | None = None):
        if not os.environ.get("OPENROUTER_API_KEY"):
            raise ScriptError("OPENROUTER_API_KEY is not set")
        self.model, self.voice, self.prefix, self.max_chars, self.speed = model, voice, prefix, max_chars, speed

    def spoken(self, text: str) -> str:
        return re.sub(r"[ \t]+", " ", text).strip()

    def say(self, text: str) -> np.ndarray:
        body = {"model": self.model, "input": self.prefix + self.spoken(text), "response_format": "mp3"}
        if self.voice:
            body["voice"] = self.voice
        if self.speed:
            body["speed"] = self.speed
        key = hashlib.sha1(json.dumps(body, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        path = CACHE / "tts" / f"{key}.mp3"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            self.request(body, path)
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ar", str(self.rate), "-ac", "1", "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
        return trim(np.frombuffer(pcm, dtype=np.float32).copy(), self.rate)

    def request(self, body: dict, path: Path) -> None:
        part = path.with_suffix(".part")
        headers = f"Authorization: Bearer {os.environ['OPENROUTER_API_KEY']}\nContent-Type: application/json\n"
        for attempt in range(5):
            with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as f:
                json.dump(body, f, ensure_ascii=False)
            # the key reaches curl on stdin, never on the command line
            r = subprocess.run(["curl", "-sS", "-m", "900", "-H", "@-", "-o", str(part), "-w", "%{http_code}",
                                "--data-binary", f"@{f.name}", self.API], input=headers, capture_output=True, text=True)
            os.unlink(f.name)
            status = r.stdout.strip()
            if status == "200" and part.exists() and part.stat().st_size > 1000:
                part.replace(path)
                return
            msg = part.read_text(errors="replace")[:300] if part.exists() else r.stderr[-300:]
            if status in ("000", "429", "500", "502", "503") and attempt < 4:
                time.sleep(5 * 2 ** attempt)
                continue
            raise ScriptError(f"OpenRouter TTS failed (HTTP {status}): {msg}")

    def describe(self) -> str:
        return (f"openrouter {self.model} voice={self.voice} prefix={self.prefix.strip()!r} max_chars={self.max_chars}"
                + (f" speed={self.speed}" if self.speed else ""))


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

def groups(slides: list[dict], max_chars: int) -> list[list[int]]:
    """Consecutive slide indexes, each group at most max_chars of narration (a longer slide stands alone)."""
    out, size = [], 0
    for i, s in enumerate(slides):
        if out and size + len(s["say"]) <= max_chars:
            out[-1].append(i)
            size += len(s["say"])
        else:
            out.append([i])
            size = len(s["say"])
    return out


def synthesize_groups(spec: dict, speaker, checker: Checker | None) -> dict[int, list[tuple[str, np.ndarray]]]:
    """Cloud voice: per slide, its audio cut into (sentence, audio) pieces. Slides of a group come from one request;
    the sentence (and so slide) boundaries are found by aligning the recognizer's timestamps to the script."""
    rate, slides, out = speaker.rate, spec["slides"], {}
    for g in groups(slides, speaker.max_chars):
        x = speaker.say("\n".join(slides[i]["say"] for i in g))
        sents = [(i, s) for i in g for s in sentences(slides[i]["say"])]
        ends = asr_split(checker, x, rate, [s for _, s in sents]) if checker else None
        if ends is None:
            if len(g) > 1:
                raise ScriptError(f"{spec['id']}: cannot place slide boundaries in slides {g[0] + 1}-{g[-1] + 1} "
                                  "(needs --asr, and the narration must match the script)")
            ends = split_points(x, rate, [s for _, s in sents])
        starts = [0.0] + ends[:-1]
        for (i, sent), a, b in zip(sents, starts, ends):
            out.setdefault(i, []).append((sent, x[int(a * rate):int(b * rate)]))
    return out


def narrate(spec: dict, speaker, checker: Checker | None, min_seconds: float = 0.0):
    """Synthesize every slide; return audio pieces, subtitle cues, per-slide durations and the QA rows.
    If the result would be shorter than min_seconds, the pause after each slide grows (up to MAX_PAD each)."""
    rate, slides = speaker.rate, spec["slides"]
    by_slide = synthesize_groups(spec, speaker, checker) if speaker.unit == "group" else None
    pad = 0.0
    for final in (False, True):            # first pass only measures the length (no recognizer)
        audio, cues, durations, qa = [], [], [], []
        t = 0.0
        for i, slide in enumerate(slides):
            start = t
            audio.append(np.zeros(int(LEAD * rate), np.float32))
            t += LEAD
            pieces = by_slide[i] if by_slide is not None else None
            t = narrate_slide(slide, pieces, speaker, checker if final else None, audio, cues, qa, t)
            tail = TAIL + (pad if i < len(slides) - 1 else 0.0)
            audio.append(np.zeros(int(tail * rate), np.float32))
            t += tail
            durations.append(t - start)
        if not final and t < min_seconds:
            pad = min(MAX_PAD, (min_seconds - t) / max(1, len(slides) - 1) + 0.05)
    return audio, cues, durations, qa


def narrate_slide(slide: dict, pieces_in, speaker, checker, audio: list, cues: list, qa: list, t: float) -> float:
    """Append one slide's narration (audio, cues, QA rows) starting at time t; return the new time.
    pieces_in: (sentence, audio) pairs already cut from a group request, or None to synthesize sentence by sentence."""
    rate = speaker.rate
    pieces = []                            # (sentence, its audio, start time, duration)
    if pieces_in is not None:
        for sent, x in pieces_in:
            pieces.append((sent, x, t, len(x) / rate))
            audio.append(x)
            t += len(x) / rate
    else:
        for k, sent in enumerate(sentences(slide["say"])):
            if k:
                audio.append(np.zeros(int(GAP * rate), np.float32))
                t += GAP
            x = speaker.say(sent)
            pieces.append((sent, x, t, len(x) / rate))
            audio.append(x)
            t += len(x) / rate
    for sent, x, c0, dur in pieces:
        chunks = cue_chunks(sent)
        total = sum(weight(c) for c in chunks)
        for c in chunks:
            c1 = c0 + dur * weight(c) / total
            cues.append((c0, c1, c))
            c0 = c1
        if checker:
            qa.append(checker.check(speaker, sent, x))
    return t


def loudnorm(wav: Path) -> str:
    """Two-pass, linear loudness normalisation to -18 LUFS (no dynamic compression)."""
    target = "I=-18:TP=-2:LRA=11"
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    m = json.loads(err[err.rindex("{"):err.rindex("}") + 1])
    return (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")


def build(script: Path, speaker, checker: Checker | None, args) -> dict:
    spec = parse_script(script)
    vid = spec["id"]
    rate = speaker.rate
    audio, cues, durations, qa = narrate(spec, speaker, checker, args.min_seconds)

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
               "-af", loudnorm(wav), "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "24000",
               "-c:s", "mov_text", "-metadata:s:s:0", "language=chi", "-metadata", f"title={spec['title']}",
               "-movflags", "+faststart", "-shortest", str(mp4)]
        subprocess.run(cmd, check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(pngs[0]), "-q:v", "4", str(VIDEOS / f"{vid}.jpg")], check=True)
    seconds = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp4)],
                                   capture_output=True, text=True, check=True).stdout)
    info = {"id": vid, "title": spec["title"], "seconds": round(seconds, 1), "slides": len(spec["slides"]),
            "characters": sum(len(s["say"]) for s in spec["slides"]), "bytes": mp4.stat().st_size, "voice": speaker.describe()}
    if qa:
        add_qa(info, qa)
    (VIDEOS / f"{vid}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
    return info


def add_qa(info: dict, qa: list[dict]) -> None:
    info["asr_cer"] = round(float(np.mean([q["cer"] for q in qa])), 3)
    info["worst"] = sorted(qa, key=lambda q: -q["cer"])[:5]


def recheck(script: Path, speaker, checker: Checker) -> dict:
    """Redo only the transcription check of a built video (audio comes from the TTS cache)."""
    spec = parse_script(script)
    path = VIDEOS / f"{spec['id']}.json"
    info = json.loads(path.read_text(encoding="utf-8"))
    add_qa(info, narrate(spec, speaker, checker)[3])
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
    ap.add_argument("--engine", choices=["openrouter", "kokoro"], default="openrouter", help="voice (default: openrouter)")
    ap.add_argument("--or-model", default="fish-audio/s2.1-pro-free:free", help="OpenRouter TTS model")
    ap.add_argument("--or-voice", default="96ea459f9ca145899ade882d871d2968", help="OpenRouter voice (for Fish Audio: a voice-library id)")
    ap.add_argument("--or-prefix", default="[台灣口音，低沉、沉穩的男聲] ", help="text put before each request (a style tag)")
    ap.add_argument("--or-max-chars", type=int, default=4000, help="narration characters per request; 1 = one request per slide")
    ap.add_argument("--or-speed", type=float, help="speed field sent with each request (not every model honours it)")
    ap.add_argument("--model", required=False, help="kokoro: sherpa-onnx kokoro-int8-multi-lang-v1_1 directory")
    ap.add_argument("--asr", help="optional sense-voice directory for the transcription check")
    ap.add_argument("--sid", type=int, default=40, help="kokoro speaker id (default 40)")
    ap.add_argument("--speed", type=float, default=1.1, help="kokoro speed")
    ap.add_argument("--font-css", action="append", default=[], help="CSS file(s) with @font-face rules (e.g. @fontsource 400.css)")
    ap.add_argument("--playwright", help="path to the playwright package if it is not resolvable from here")
    ap.add_argument("--chromium", help="Chromium executable for Playwright")
    ap.add_argument("--min-seconds", type=float, default=182.0, help="pad slide changes (up to %.1fs each) to reach this length" % MAX_PAD)
    ap.add_argument("--check-only", action="store_true", help="only parse the scripts")
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--qa-only", action="store_true", help="only redo the transcription check of built videos (needs --asr)")
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
    try:
        if args.engine == "kokoro":
            if not args.model:
                raise ScriptError("--engine kokoro needs --model")
            speaker = Speaker(args.model, args.sid, args.speed)
        else:
            speaker = OpenRouterSpeaker(args.or_model, args.or_voice, args.or_prefix, args.or_max_chars, args.or_speed)
    except ScriptError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
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
        try:
            info = build(p, speaker, checker, args)
        except ScriptError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        print(f"{info['id']:32s} {info['seconds']:6.1f}s  {info['bytes']/1e6:5.2f} MB  slides={info['slides']}"
              + (f"  asr_cer={info['asr_cer']:.3f}" if "asr_cer" in info else ""), flush=True)
    write_manifest()
    return 0


if __name__ == "__main__":
    sys.exit(main())
