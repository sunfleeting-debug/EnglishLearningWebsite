# -*- coding: utf-8 -*-
"""全量 OCR DRJ172 的三个 PDF，结果存 tools/.cache/ocr/<key>.json（含文本与坐标）。

为什么要 OCR：这三个 PDF 是扫描件，文本层因字体缺 ToUnicode 映射而全是乱码
（提取出来是 !"#$%&'() 这类字形索引），无法直接取文本。
"""
import io
import json
import os
import time

import numpy as np
import pymupdf
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", ".cache", "ocr")
os.makedirs(OUT, exist_ok=True)

PDFS = {
    "practice": "DRJ172简六级阅读/DRJ172-阅读海量练习扫一扫.pdf",
    "translation": "DRJ172简六级阅读/DRJ172-阅读参考译文扫一扫.pdf",
    "source": "DRJ172简六级阅读/DRJ172-阅读题源文章扫一扫.pdf",
}

DPI = 150          # 150dpi 兼顾识别率与速度
engine = RapidOCR()


def main():
    for key, rel in PDFS.items():
        path = os.path.join(ROOT, rel)
        doc = pymupdf.open(path)
        pages = []
        t0 = time.time()
        for i in range(doc.page_count):
            pix = doc[i].get_pixmap(dpi=DPI)
            img = np.array(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
            result, _ = engine(img)
            items = []
            for it in (result or []):
                box, text = it[0], it[1]
                score = float(it[2]) if len(it) > 2 else 0.0
                items.append({
                    "box": [[float(x), float(y)] for x, y in box],
                    "text": text,
                    "score": round(score, 3),
                })
            pages.append({"page": i + 1, "items": items})
            print("[%s] %2d/%2d  %3d blocks  %.1fs" % (key, i + 1, doc.page_count, len(items), time.time() - t0), flush=True)
        doc.close()
        with open(os.path.join(OUT, key + ".json"), "w", encoding="utf-8") as f:
            json.dump({"file": rel, "pages": pages}, f, ensure_ascii=False, indent=1)
        print("== saved %s  (%d pages, %.1fs)" % (key, len(pages), time.time() - t0), flush=True)


if __name__ == "__main__":
    main()
