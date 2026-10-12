# -*- coding: utf-8 -*-
"""从 OCR 结果里把「结构标记」映射到具体页码，确认每个 Passage / 答案详解 落在哪一页。
只读分析，输出到 tools/.cache/page_map.txt
"""
import json
import os
import re

CACHE = os.path.join(os.path.dirname(__file__), ".cache", "ocr")
OUT = os.path.join(os.path.dirname(__file__), ".cache", "page_map.txt")

KEYS = [
    re.compile(r"^Model\s*Test\s*[12]$"),
    re.compile(r"^Passage\s*[1-4]$"),
    re.compile(r"^答案详解$"),
    re.compile(r"^答案解析$"),
    re.compile(r"^选项词性分类$"),
    re.compile(r"^参考译文$"),
    re.compile(r"^题源[）)]?分?析?$"),
    re.compile(r"^题源时文$"),
]
# 题源/题材/建议用时 行
INFO = re.compile(r"(题源|题材|建议用时)")


def main():
    lines = []
    for doc in ("practice", "translation", "source"):
        p = os.path.join(CACHE, doc + ".json")
        if not os.path.exists(p):
            continue
        data = json.load(open(p, encoding="utf-8"))
        pages = data["pages"] if isinstance(data, dict) else data
        lines.append("=" * 60)
        lines.append("### %s (%d 页)" % (doc, len(pages)))
        for i, pg in enumerate(pages, 1):
            texts = []
            for b in pg.get("items", []):
                t = (b.get("text") or "").strip()
                if t:
                    texts.append(t)
            hits = []
            for t in texts:
                s = t.replace(" ", "")
                if any(k.match(s) for k in KEYS) or INFO.search(s):
                    hits.append(t)
            first = texts[0][:34] if texts else ""
            lines.append("  p%-3d %s" % (i, " | ".join(hits) if hits else ("(%s)" % first)))
    open(OUT, "w", encoding="utf-8").write("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
