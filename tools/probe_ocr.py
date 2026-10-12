# -*- coding: utf-8 -*-
"""测试 RapidOCR 对 DRJ172 扫描页的识别质量（先只跑第 1 页）。"""
import os
import sys

from rapidocr_onnxruntime import RapidOCR

IMG = os.path.join(os.path.dirname(__file__), ".cache", "pdf_probe",
                   "DRJ172-阅读海量练习扫一扫_p1.png")

engine = RapidOCR()
result, elapse = engine(IMG)

print("识别到 %d 个文本块，耗时 %s" % (len(result or []), elapse))
print("=" * 60)
print("原始结构示例:", type(result[0]), len(result[0]), repr(result[0][1])[:80] if len(result[0]) > 1 else "")
print("=" * 60)
if result:
    for i, item in enumerate(result):
        if i >= 45:
            break
        box, text = item[0], item[1]
        score = item[2] if len(item) > 2 else None
        print("%3d  [%s]  %s" % (i, score, text))
