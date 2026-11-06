"""Render the supplied 2024 listening transcripts and translation booklets for the web."""
import json
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / '星火六级' / '六级真题' / '六级真题'
TARGET = ROOT / 'assets' / 'listening-text'


def render(pdf, pages, directory, kind, dpi=140, quality=85):
    directory.mkdir(parents=True, exist_ok=True)
    result = []
    with fitz.open(pdf) as doc:
        for page_number in pages:
            name = f'{kind}-{page_number:02}.webp'
            if not (directory / name).exists():
                pix = doc[page_number - 1].get_pixmap(dpi=dpi, alpha=False)
                im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
                im.save(directory / name, format='WEBP', quality=quality, method=4)
            result.append(f'assets/listening-text/{directory.name}/{name}')
    return result


def main():
    paper_dir = next(PAPERS.glob('2024年06*'))
    output = {}
    for number, label in ((1, '第一套'), (2, '第二套')):
        source = next(p for p in paper_dir.rglob('*.pdf') if '解析' in p.name and f'第{number}套' in p.name)
        translation = next((ROOT / '星火六级').rglob(f'202406_{label}_听力原文译文.pdf'))
        dest = TARGET / f'202406-{number}'
        output[f'personal-cet6-202406-{number}-listening'] = {
            'original': render(source, range(2, 10), dest, 'original'),
            'translation': render(translation, range(1, 5), dest, 'translation'),
        }
    reference = ROOT / '星火六级' / '2026版星火英语六级真题详解'
    combined = [
        ('202007', 1, '2020.07英语六级考试全1套解析.pdf', 28),
        ('202009', 1, '2020.09英语六级考试第1套解析.pdf', 28),
        ('202012', 1, '2020.12英语六级考试解析第1套.pdf', 28),
        ('202012', 2, '2020.12英语六级考试解析第2套.pdf', 28),
        ('202106', 1, '2021.06英语六级考试第1套解析.pdf', 29),
        ('202106', 2, '2021.06英语六级考试第2套解析.pdf', 29),
    ]
    for yearmonth, number, name, last in combined:
        source = next(reference.rglob(name))
        dest = TARGET / f'{yearmonth}-{number}'
        output[f'personal-cet6-{yearmonth}-{number}-listening'] = {
            'combined': render(source, range(3, last + 1), dest, 'combined', dpi=150, quality=70)
        }
        print(f'{yearmonth}-{number}: {last - 2} pages', flush=True)
    (ROOT / 'data' / 'personal-listening-scans.js').write_text(
        'window.TW_PERSONAL_LISTENING_SCANS = ' + json.dumps(output, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8')
    print(f'Prepared listening books for {len(output)} recordings.')


if __name__ == '__main__':
    main()
