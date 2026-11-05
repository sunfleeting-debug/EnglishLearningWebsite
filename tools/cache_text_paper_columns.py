"""Preserve text-line coordinates in searchable answer-book PDFs."""
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache' / 'pdf_probe'
MATERIALS = ROOT / '星火六级' / '六级真题' / '六级真题'


def main():
    for yearmonth in ('202106', '202112', '202206', '202209', '202606'):
        directory = next(MATERIALS.glob(f'{yearmonth[:4]}年{yearmonth[4:]}*'))
        for number in (1, 2, 3):
            pdfs = [p for p in directory.rglob('*.pdf') if ('解析' in p.name or '详解' in p.name)
                    and re.search(r'第\s*' + str(number) + r'\s*套', p.name)]
            if len(pdfs) != 1:
                continue
            pages = []
            with fitz.open(pdfs[0]) as document:
                for n, page in enumerate(document, 1):
                    items = []
                    for block in page.get_text('dict')['blocks']:
                        for line in block.get('lines', []):
                            text = ''.join(span['text'] for span in line['spans']).strip()
                            if not text:
                                continue
                            x0, y0, x1, y1 = line['bbox']
                            items.append({'box': [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                                          'text': text, 'confidence': 1.0})
                    pages.append({'page': n, 'width': page.rect.width, 'height': page.rect.height, 'items': items})
            out = CACHE / f'{yearmonth}-answer-columns-{number}.json'
            out.write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
            print(f'{out.name}: {len(pages)} searchable pages')


if __name__ == '__main__':
    main()
