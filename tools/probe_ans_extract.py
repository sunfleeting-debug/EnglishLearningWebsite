# -*- coding: utf-8 -*-
"""验证答案提取的覆盖率：把解析页文本拼接成流后再用多种模式匹配。"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, "tools", ".cache", "ocr", "practice.json"), encoding="utf-8"))


def flow(pages):
    """把若干页（1-based）的文本块拼成一条长流，消除 OCR 断行影响。"""
    buf = []
    for p in pages:
        for it in d["pages"][p - 1]["items"]:
            t = it["text"].strip()
            if t and not re.search(r"星火|Spark|^spa[rl]$|^英语$|^火英语$", t, re.I):
                buf.append(t)
    return re.sub(r"\s+", " ", " ".join(buf))


# Model Test 1 的解析在 p7-p11，Model Test 2 在 p18-p22
for label, pages in (("MT1 解析 p7-p11", range(7, 12)), ("MT2 解析 p18-p22", range(18, 23))):
    txt = flow(pages)
    print("=" * 70)
    print("###", label, " 长度", len(txt))
    print("  1) N.X）模式      :", re.findall(r"(\d{1,2})\s*[.．]\s*([A-O])\s*）", txt))
    print("  2) 正确答案为 X   :", re.findall(r"正确答案为\s*([A-O])", txt))
    print("  3) X）为正确答案  :", re.findall(r"([A-O])\s*[）)]\s*为正确答案", txt))
    print("  4) 答案为 X       :", re.findall(r"答案为\s*([A-O])", txt))
    print("  5) 答案选 X       :", re.findall(r"答案选\s*([A-O])", txt))
