"""Render the supplied 2024 listening transcripts and translation booklets for the web."""
import json
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / '星火六级' / '六级真题' / '六级真题'
TARGET = ROOT / 'assets' / 'listening-text'
TRANSLATIONS = ROOT / '星火六级' / '听力译文（配套）'


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
    # Later answer books contain the English scripts but not full Chinese translations.
    # Keep this provenance explicit in the UI rather than presenting answer rationales as translations.
    originals = [
        ('202112', 1, 7), ('202112', 2, 7), ('202206', 1, 7), ('202209', 1, 6),
        ('202212', 1, 7), ('202212', 2, 7), ('202303', 1, 5),
        ('202306', 1, 7), ('202306', 2, 6), ('202312', 1, 9), ('202312', 2, 10),
        ('202412', 1, 6), ('202412', 2, 6), ('202506', 1, 10), ('202506', 2, 10),
        ('202512', 1, 9), ('202512', 2, 9), ('202606', 1, 10), ('202606', 2, 11),
    ]
    for yearmonth, number, last in originals:
        folder = next(PAPERS.glob(f'{yearmonth[:4]}年{yearmonth[4:]}*'))
        source = next(p for p in folder.rglob('*.pdf') if ('解析' in p.name or '详解' in p.name) and f'第{number}套' in p.name)
        dest = TARGET / f'{yearmonth}-{number}'
        first = 1 if yearmonth in ('202209', '202303') else 2
        output[f'personal-cet6-{yearmonth}-{number}-listening'] = {
            'original': render(source, range(first, last + 1), dest, 'original', dpi=140, quality=70),
            'originalOnly': True,
        }
        # The original answer-book QR codes link to these supplied translation booklets.
        translation_pdf = TRANSLATIONS / ('202506-listening-translation.pdf' if yearmonth == '202506'
                                   else f'202512-{number}-listening-translation.pdf')
        if yearmonth in ('202506', '202512'):
            if not translation_pdf.exists():
                raise FileNotFoundError(f'缺少配套听力译文：{translation_pdf}')
            translation_pages = (range(1, 5) if number == 1 else range(5, 9)) if yearmonth == '202506' else range(1, 8)
            output[f'personal-cet6-{yearmonth}-{number}-listening']['translation'] = render(
                translation_pdf, translation_pages, dest, 'translation', dpi=150, quality=80)
            del output[f'personal-cet6-{yearmonth}-{number}-listening']['originalOnly']
        print(f'{yearmonth}-{number}: English script pages 2–{last}', flush=True)
    (ROOT / 'data' / 'personal-listening-scans.js').write_text(
        'window.TW_PERSONAL_LISTENING_SCANS = ' + json.dumps(output, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8')
    print(f'Prepared listening books for {len(output)} recordings.')


if __name__ == '__main__':
    main()
