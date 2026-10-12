# -*- coding: utf-8 -*-
"""把 DRJ172 的三个 PDF 各渲染前几页为 PNG，用于人工确认内容结构。"""
import glob
import os

import pymupdf

OUT = os.path.join(os.path.dirname(__file__), ".cache", "pdf_probe")
os.makedirs(OUT, exist_ok=True)

for p in sorted(glob.glob("DRJ172简六级阅读/*.pdf")):
    name = os.path.splitext(os.path.basename(p))[0]
    doc = pymupdf.open(p)
    n = min(3, doc.page_count)
    for i in range(n):
        pix = doc[i].get_pixmap(dpi=100)
        out = os.path.join(OUT, "%s_p%d.png" % (name, i + 1))
        pix.save(out)
        print("saved", out, pix.width, "x", pix.height)
    doc.close()
