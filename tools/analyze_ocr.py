# -*- coding: utf-8 -*-
"""分析 DRJ172 OCR 结果的文档结构：定位 Model Test / Passage / 答案 等标记。"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache", "ocr")
OUT = os.path.join(ROOT, "tools", ".cache", "analyze.txt")

WATERMARK = re.compile(r"星火|Spark|spark")
MARK = re.compile(r"Model Test|Passage\s*(One|Two|Three|Four|\d+)|答案|Answer|KEYS|参考译文|题源|题材|建议用时", re.I)


def load(key):
    with open(os.path.join(CACHE, key + ".json"), encoding="utf-8") as f:
        return json.load(f)


def main():
    buf = []
    for key in ("practice", "translation", "source"):
        d = load(key)
        buf.append("=" * 78)
        buf.append("### %s  (共 %d 页)" % (key, len(d["pages"])))
        for pg in d["pages"]:
            lines = [it["text"].strip() for it in pg["items"] if it["text"].strip()]
            clean = [ln for ln in lines if not WATERMARK.search(ln)]
            marks = [ln[:58] for ln in clean if MARK.search(ln)]
            first = clean[0] if clean else ""
            buf.append("  p%-2d | %-44s | %s" % (pg["page"], first[:44], " ;; ".join(marks[:6])))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(buf))
    print("written", OUT)


if __name__ == "__main__":
    main()
