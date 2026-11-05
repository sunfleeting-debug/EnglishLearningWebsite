"""Recognize the missing 2025.12 answer-book pages used by the question bank."""
import json
import multiprocessing

from cache_paper_note_ocr import CACHE, MATERIALS, initialize
from cache_two_column_notes import recognize


def main():
    output = CACHE / '202512-key-1.json'
    if output.exists():
        print('202512-key-1.json: already available')
        return
    directory = next(MATERIALS.glob('2025年12*'))
    pdf = next(p for p in directory.rglob('*.pdf') if '解析' in p.name and '第1套' in p.name)
    with multiprocessing.Pool(2, initializer=initialize) as pool:
        pages = pool.map(recognize, [(str(pdf), n) for n in (15, 16, 17, 18)])
    result = [{'page': page['page'], 'lines': [item['text'] for item in page['items']]} for page in pages]
    output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    print('202512-key-1.json: recognized 4 pages', flush=True)


if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
