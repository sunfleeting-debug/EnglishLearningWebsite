# -*- coding: utf-8 -*-
"""把 OCR 结果按阅读顺序（先 y 后 x）还原成可读文本，便于分析结构与提取答案。"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache", "ocr")
OUT = os.path.join(ROOT, "tools", ".cache")

# 水印噪声：星火英语 / Spark / 被截断的 spar、spal 等
WM = re.compile(r"星火|Spark|^spa[rl]$|^英语$|^火英语$", re.I)


def load(key):
    with open(os.path.join(CACHE, key + ".json"), encoding="utf-8") as f:
        return json.load(f)


def ordered_lines(pg):
    items = []
    for it in pg["items"]:
        t = it["text"].strip()
        if not t or WM.search(t):
            continue
        ys = [p[1] for p in it["box"]]
        xs = [p[0] for p in it["box"]]
        items.append((min(ys), min(xs), t))
    # y 聚类到 ~12px 一格，再按 x 排序，尽量还原行序
    items.sort(key=lambda z: (round(z[0] / 12.0), z[1]))
    return [t for _, _, t in items]


def main():
    for key in ("practice", "translation", "source"):
        d = load(key)
        buf = []
        for pg in d["pages"]:
            buf.append("\n========== %s  p%d ==========" % (key, pg["page"]))
            buf.extend(ordered_lines(pg))
        path = os.path.join(OUT, key + "_text.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(buf))
        print("written", path, len(buf), "lines")


if __name__ == "__main__":
    main()
