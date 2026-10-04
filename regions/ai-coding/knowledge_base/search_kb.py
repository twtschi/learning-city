#!/usr/bin/env python3
"""Search the local knowledge-base index (rag/chunks.jsonl) with BM25. No dependencies.

    python search_kb.py "prompt caching" -k 5
    python search_kb.py "unit tests fixture" --chapter ch08
    python search_kb.py "vibe coding" --source coding-with-ai --full

The index holds raw source text and exists only on this machine (see README).
Indexed sources are English; queries should be too.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

CHUNKS = Path(__file__).resolve().parent / "rag" / "chunks.jsonl"
STOP = set("a an and are as at be by for from in is it of on or that the this to was with you your we our can will not but if so do".split())


def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9_]+", text.lower()) if t not in STOP and len(t) > 1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("query")
    ap.add_argument("-k", type=int, default=5, help="number of results")
    ap.add_argument("--source")
    ap.add_argument("--chapter")
    ap.add_argument("--full", action="store_true", help="print the whole chunk")
    args = ap.parse_args()

    if not CHUNKS.exists():
        print("No index. Run: python tools/build_knowledge_base.py --source coding-with-ai=PATH_TO_PDF", file=sys.stderr)
        return 1
    records = [json.loads(line) for line in CHUNKS.open(encoding="utf-8")]
    records = [r for r in records if (not args.source or r["source"] == args.source) and (not args.chapter or r["chapter"] == args.chapter)]
    docs = [tokens(r["text"]) for r in records]
    df: Counter[str] = Counter()
    for d in docs:
        df.update(set(d))
    avg = sum(len(d) for d in docs) / max(len(docs), 1)
    query = tokens(args.query)
    scored = []
    for rec, d in zip(records, docs):
        tf = Counter(d)
        score = 0.0
        for term in query:
            if term in tf:
                idf = math.log(1 + (len(docs) - df[term] + 0.5) / (df[term] + 0.5))
                score += idf * tf[term] * 2.2 / (tf[term] + 1.2 * (0.25 + 0.75 * len(d) / avg))
        if score > 0:
            scored.append((score, rec))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        print("no matches")
        return 0
    for score, rec in scored[: args.k]:
        text = rec["text"] if args.full else rec["text"][:260] + ("..." if len(rec["text"]) > 260 else "")
        print(f"[{score:5.2f}] {rec['source']} {rec['chapter'] or '-'} p.{rec['page']}\n        {text}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
