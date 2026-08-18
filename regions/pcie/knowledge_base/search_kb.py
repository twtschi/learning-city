"""Small dependency-free search utility for pcie3_chunks.jsonl."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path


ALIASES = {
    "列舉": ["enumeration", "枚舉", "探測"],
    "枚舉": ["enumeration", "列舉", "探測"],
    "組態": ["configuration", "設定"],
    "設定": ["configuration", "組態"],
    "事務": ["transaction", "交易"],
    "交易": ["transaction", "事務"],
    "流量控制": ["flow control", "credit"],
    "資料連結": ["data link", "資料鏈路"],
    "資料鏈路": ["data link", "資料連結"],
    "實體層": ["physical layer", "phy"],
    "重送": ["replay", "重播"],
    "重播": ["replay", "重送"],
    "中斷": ["interrupt", "msi"],
    "錯誤": ["error", "aer"],
    "電源": ["power", "pm"],
    "路由": ["routing"],
    "封包": ["packet", "tlp"],
    "排序": ["ordering"],
    "位址": ["address"],
}


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def score_record(record, phrase: str, terms):
    title = normalize(record.get("title", "") + " " + " ".join(record.get("tags", [])))
    content = normalize(record.get("content", ""))
    score = content.count(phrase) * 20 + title.count(phrase) * 40
    for term in terms:
        score += content.count(term)
        score += title.count(term) * 6
    return score


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Search the PCIe 3.0 knowledge base")
    parser.add_argument("query", help="English term or Chinese phrase")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--source", choices=["BOOK", "BP", "KB_NOTE"])
    args = parser.parse_args()

    phrase = normalize(args.query).strip()
    terms = [token for token in re.split(r"\s+", phrase) if token]
    for key, aliases in ALIASES.items():
        if key in phrase:
            terms.extend(normalize(alias) for alias in aliases)
    path = Path(__file__).resolve().parent / "rag" / "pcie3_chunks.jsonl"
    matches = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            record = json.loads(line)
            if args.source and record["source_id"] != args.source:
                continue
            score = score_record(record, phrase, terms)
            if score:
                matches.append((score, record))

    for rank, (score, record) in enumerate(sorted(matches, key=lambda item: item[0], reverse=True)[: args.limit], start=1):
        page = f" PDF p.{record['pdf_page']}" if record.get("pdf_page") else ""
        snippet = re.sub(r"\s+", " ", record["content"]).strip()
        if len(snippet) > 360:
            snippet = snippet[:357] + "..."
        print(f"{rank}. [{record['source_id']}{page}] {record['title']} (score={score})")
        print(f"   {snippet}\n")


if __name__ == "__main__":
    main()
