"""Recognize answer-book pages with positions so two columns can be separated."""
import json
import multiprocessing
import re
from pathlib import Path

from cache_paper_note_ocr import CACHE, MATERIALS, initialize


def recognize(task):
    import fitz
    import numpy as np
    import cache_paper_note_ocr as ocr
    pdf, page_number = task
    with fitz.open(pdf) as doc:
        pix = doc[page_number - 1].get_pixmap(dpi=120, alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        rows, _ = ocr.ENGINE(image)
        return {'page': page_number, 'width': pix.width, 'height': pix.height,
                'items': [{'box': box, 'text': text, 'confidence': float(confidence)}
                          for box, text, confidence in (rows or [])]}


def main():
    for yearmonth in ('202212', '202303', '202306', '202412', '202106'):
        directory = next(MATERIALS.glob(f'{yearmonth[:4]}年{yearmonth[4:]}*'))
        for number in (1, 2, 3):
            raw = CACHE / f'{yearmonth}-{"ocr" if yearmonth == "202106" else "answers"}-{number}.json'
            out = CACHE / f'{yearmonth}-{"scan-columns" if yearmonth == "202106" else "answer-columns"}-{number}.json'
            if not raw.exists():
                continue
            pages = json.loads(raw.read_text(encoding='utf-8'))
            last_objective = max((p['page'] for p in pages if any(
                re.match(r'^\s*55\s*[.．。]', line) for line in p['lines'])), default=max(p['page'] for p in pages))
            selected = sorted({p['page'] for p in pages if any(
                re.match(r'^\s*(?:[1-9]|[1-4][0-9]|5[0-5])\s*[.．。]', line)
                for line in p['lines']) and p['page'] <= last_objective})
            previous = json.loads(out.read_text(encoding='utf-8')) if out.exists() else []
            missing = [page for page in selected if page not in {p['page'] for p in previous}]
            if not missing:
                continue
            pdf = next(p for p in directory.rglob('*.pdf')
                       if ('解析' in p.name or '详解' in p.name) and f'第{number}套' in p.name)
            with multiprocessing.Pool(2, initializer=initialize) as pool:
                data = previous + pool.map(recognize, [(str(pdf), n) for n in missing])
            data.sort(key=lambda p: p['page'])
            out.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            print(f'{out.name}: recognized {len(data)} pages', flush=True)


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
