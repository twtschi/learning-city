#!/usr/bin/env python3
"""Re-run the code blocks in notes and check the outputs the notes claim.

A note marks a measured result like this:

    **【實測】** 輸出：

    ```text
    ...the output the note shows...
    ```

This tool runs every ```python block of a note (concatenated, in order) and every ```bash
block (a block starting with a shebang is saved as deploy.sh; other bash blocks are run as
drivers next to it), then checks that each non-empty line of each 【實測】 text block appears
in the real output. Timings such as "0.15s" or "215.1 ms" are masked before comparing.

Usage:
    python knowledge_base/tools/verify_lab_outputs.py                 # every note that has a 【實測】 block
    python knowledge_base/tools/verify_lab_outputs.py taulli-safe-refactoring taulli-data-ui-api

Needs: Python 3.11+ (tomllib), PyYAML (pip install pyyaml), Node.js (the refactoring lab calls `node`).
It EXECUTES the notes' code, so only run it on notes you trust. Exit code is non-zero on any failure.
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

NOTES_DIR = Path(__file__).resolve().parents[1] / "notes"
FENCE = re.compile(r"^```([\w+-]*)\s*$")
MARK = "【實測】"


def parse_blocks(markdown: str) -> list[dict]:
    """Fenced blocks in order. `measured` is True when the last prose line before the block has 【實測】."""
    blocks, lines, i, last_prose = [], markdown.split("\n"), 0, ""
    while i < len(lines):
        match = FENCE.match(lines[i])
        if match:
            body = []
            i += 1
            while i < len(lines) and not FENCE.match(lines[i]):
                body.append(lines[i])
                i += 1
            blocks.append({"lang": match.group(1) or "text", "code": "\n".join(body), "measured": MARK in last_prose})
        elif lines[i].strip():
            last_prose = lines[i]
        i += 1
    return blocks


def mask(text: str) -> str:
    text = re.sub(r"\d+\.\d\d?s\b", "<t>", text)
    text = re.sub(r"[\d.]+ ms", "<ms>", text)
    text = re.sub(r'File ".*?", line \d+', "File <f>", text)
    return re.sub(r"\s+", " ", text).strip()


def run(cmd: list[str], cwd: str) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=300)


def verify(path: Path) -> list[str]:
    blocks = parse_blocks(path.read_text(encoding="utf-8"))
    python = [b["code"] for b in blocks if b["lang"] == "python"]
    bash = [b["code"] for b in blocks if b["lang"] == "bash"]
    produced: list[str] = []
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        if python:
            script = Path(tmp) / "lab.py"
            script.write_text("\n\n".join(python), encoding="utf-8")
            result = run([sys.executable, str(script)], tmp)
            produced += (result.stdout + result.stderr).split("\n")
            if result.returncode != 0:
                problems.append(f"python 區塊以 {result.returncode} 結束：{result.stderr[-300:].strip()}")
        shebang = next((code for code in bash if code.startswith("#!")), None)
        if shebang:
            (Path(tmp) / "deploy.sh").write_text(shebang, encoding="utf-8")
            for code in (c for c in bash if not c.startswith("#!")):
                (Path(tmp) / "driver.sh").write_text(code, encoding="utf-8")
                result = run(["bash", "driver.sh"], tmp)
                produced += (result.stdout + result.stderr).split("\n")
    seen = {mask(line) for line in produced if line.strip()}
    for block in blocks:
        if block["lang"] == "text" and block["measured"]:
            for line in block["code"].split("\n"):
                if line.strip() and mask(line) not in seen:
                    problems.append(f"筆記顯示的輸出行在實際輸出中找不到：{line!r}")
    return problems


def main() -> int:
    wanted = set(sys.argv[1:])
    failed = 0
    for path in sorted(NOTES_DIR.glob("*.md")):
        if wanted and path.stem not in wanted:
            continue
        text = path.read_text(encoding="utf-8")
        if MARK not in text:
            continue
        problems = verify(path)
        print(f"{'FAIL' if problems else 'OK  '} {path.stem}")
        for problem in problems:
            print(f"     {problem}")
        failed += bool(problems)
    unknown = wanted - {p.stem for p in NOTES_DIR.glob("*.md")}
    if unknown:
        print(f"error: unknown note id(s): {sorted(unknown)}", file=sys.stderr)
        return 2
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
