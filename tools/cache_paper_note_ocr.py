"""Recognize selected answer-book pages and retain positions for column-safe extraction."""
import json
import multiprocessing
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache' / 'pdf_probe'
MATERIALS = ROOT / '星火六级' / '六级真题' / '六级真题'
ENGINE = None


def initialize():
    global ENGINE
    sys.path.insert(0, str(ROOT / 'tools' / '.cache' / 'ocr-env'))
    import cv2
    import onnxruntime
    cv2.setNumThreads(1)
    original_options = onnxruntime.SessionOptions
    def limited_options():
        options = original_options()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        return options
    onnxruntime.SessionOptions = limited_options
    from rapidocr_onnxruntime import RapidOCR
    ENGINE = RapidOCR()


def recognize(task):
    import fitz
    import numpy as np
    pdf, page_number = task
    with fitz.open(pdf) as doc:
        page = doc[page_number - 1]
        clip = fitz.Rect(0, 0, page.rect.width * .685, page.rect.height)
        pix = page.get_pixmap(dpi=120, alpha=False, clip=clip)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        rows, _ = ENGINE(img)
        return {'page': page_number, 'width': pix.width, 'height': pix.height,
                'items': [{'box': box, 'text': text, 'confidence': float(confidence)}
                          for box, text, confidence in (rows or [])]}


def main():
    for yearmonth in ('202312', '202406', '202506', '202512'):
        directory = next(MATERIALS.glob(f'{yearmonth[:4]}年{yearmonth[4:]}*'))
        for number in (1, 2, 3):
            cache = CACHE / f'{yearmonth}-{"reading" if yearmonth == "202506" else "answers"}-{number}.json'
            output = CACHE / f'{yearmonth}-note-clipped-{number}.json'
            if output.exists():
                print(f'{output.name}: already available', flush=True)
                continue
            if yearmonth == '202512':
                pages_by_number = {}
                for kind in ('listening', 'sectionab', 'key'):
                    part = CACHE / f'{yearmonth}-{kind}-{number}.json'
                    if part.exists():
                        pages_by_number.update({p['page']: p for p in json.loads(part.read_text(encoding='utf-8'))})
                pages = sorted(pages_by_number.values(), key=lambda p: p['page'])
            else:
                pages = json.loads(cache.read_text(encoding='utf-8'))
            marked = [page['page'] for page in pages
                      if any('全文翻译' in line for line in page['lines'])]
            if len(marked) != 4:
                raise ValueError(f'Cannot locate four translations in {cache.name}')
            pdf = next(p for p in directory.rglob('*.pdf') if ('解析' in p.name or '详解' in p.name) and f'第{number}套' in p.name)
            selected = sorted(set(marked[2:] + [p + 1 for p in marked[2:]]))
            with multiprocessing.Pool(2, initializer=initialize) as pool:
                recognized = pool.map(recognize, [(str(pdf), p) for p in selected])
            output.write_text(json.dumps(recognized, ensure_ascii=False), encoding='utf-8')
            print(f'{output.name}: recognized {len(recognized)} pages', flush=True)


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
