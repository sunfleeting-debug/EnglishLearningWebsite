# -*- coding: utf-8 -*-
"""把 DRJ172 的三个 PDF 每页渲染成 WebP，供网页阅读使用。

为什么用图片而不是 OCR 文本：这三个 PDF 的文本层是乱码（字体缺 ToUnicode），
OCR 虽能识别但长文会有零星错字（实测 FISE→FTSE、corelation→correlation 等），
直接给学生读会误导；图片则 100% 保真。做题交互改用「答题卡」实现。
"""
import io
import os

import pymupdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ROOT = os.path.join(ROOT, "assets", "reading")

DPI = 160          # A4 @160dpi ≈ 1323×1872，手机缩放后依然清晰
QUALITY = 82

JOBS = [
    ("practice", "DRJ172简六级阅读/DRJ172-阅读海量练习扫一扫.pdf"),
    ("translation", "DRJ172简六级阅读/DRJ172-阅读参考译文扫一扫.pdf"),
    ("source", "DRJ172简六级阅读/DRJ172-阅读题源文章扫一扫.pdf"),
]


def main():
    total = 0
    for key, rel in JOBS:
        out_dir = os.path.join(OUT_ROOT, key)
        os.makedirs(out_dir, exist_ok=True)
        doc = pymupdf.open(os.path.join(ROOT, rel))
        for i in range(doc.page_count):
            pix = doc[i].get_pixmap(dpi=DPI)
            img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            out = os.path.join(out_dir, "p%02d.webp" % (i + 1))
            img.save(out, "WEBP", quality=QUALITY, method=6)
            total += 1
            print("%s p%02d  %dx%d  %.0fKB" % (key, i + 1, img.width, img.height,
                                              os.path.getsize(out) / 1024), flush=True)
        doc.close()
    print("== 共渲染 %d 页" % total)


if __name__ == "__main__":
    main()
