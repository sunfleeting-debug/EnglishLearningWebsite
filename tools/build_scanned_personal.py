"""Build reviewed 2026.06 listening and cloze exercises from local OCR output.

Both the scan and the resulting exercise data remain in the user's material
directory. OCR caches contain only temporary local recognition results.
"""
import difflib
import json
import re
import sys

from build_personal_papers import (MATERIALS, ROOT, clean, parse_docx_reading,
                                   parse_exam_cloze, parse_exam_match, parse_pdf_listening)

OUTPUT = MATERIALS / '英语学习站-扫描题库-202606.json'
CACHE = ROOT / 'tools' / '.cache' / 'pdf_probe'
KEYS = {
    1: ('JIDCFKBGAE', 'BCADACBAADCDBDAACBBCDDBAC', 'DIFKBHLEMJ', ('ABCDA', 'CBADD')),
    2: ('DOANEFJIBH', 'AABDDCBCACDDACABACBBDCBDC', 'FJGMDLCHKB', ('CABCD', 'CBDBA')),
}


def read_pages(number, quality):
    path = CACHE / f'202606-{quality}-{number}.json'
    if not path.exists():
        # Re-create the local OCR cache when the optional OCR dependency is installed.
        cached_packages = ROOT / 'tools' / '.cache' / 'ocr-env'
        if cached_packages.exists():
            sys.path.insert(0, str(cached_packages))
        import fitz
        import numpy as np
        from rapidocr_onnxruntime import RapidOCR

        pdf = next((MATERIALS / '六级真题' / '六级真题').glob(
            f'2026年06*/**/2026.06六级真题第{number}套*.pdf'))
        engine = RapidOCR()
        if quality == 'hi':
            engine.text_detector.preprocess_op[0].limit_side_len = 2000
        dpi = 150 if quality == 'hi' else 180
        pages = []
        with fitz.open(pdf) as document:
            for index, page in enumerate(document):
                pixmap = page.get_pixmap(dpi=dpi, alpha=False)
                image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
                result, _ = engine(image)
                pages.append({'page': index + 1, 'items': [
                    {'box': item[0], 'text': item[1], 'confidence': item[2]} for item in (result or [])]})
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
    pages = json.loads(path.read_text(encoding='utf-8'))
    if len(pages) != 9:
        raise ValueError(f'Incomplete OCR pages: {path}')
    return pages


def make_cloze(number, pages, answers):
    rows = [item['text'].strip() for page in pages for item in page['items']]
    begin = next(i for i, value in enumerate(rows) if 'more than once.' in value)
    end = next(i for i in range(begin, len(rows)) if rows[i] == 'Section B')
    rows = [value for value in rows[begin:end]
            if not re.match(r'^\s*[·•].*六级真题', value) and not re.fullmatch(r'\d{1,2}', value)]
    text = '\n'.join(rows) + '\nSection B'
    # Two punctuation marks and several missing spaces are scan recognition errors.
    text = text.replace('_ 27.-:', '_27_.').replace('causethat', 'cause—that')
    text = text.replace('or gaming"', 'or “gaming”')
    text = text.replace('personality29', 'personality 29').replace('the30', 'the 30')
    text = text.replace('carethey', 'care; they').replace('to34', 'to 34')
    body, bank, questions = parse_exam_cloze(text, answers)
    body = re.sub(r'[-_\s]*【(\d+)】[-_]*', r' 【\1】', body)
    return {'id': f'personal-cet6-202606-{number}-cloze', 'type': 'cloze',
            'test': f'2026年6月六级真题 · 第{number}套', 'no': 0, 'title': '选词填空',
            'source': '本机原卷扫描识别，文字建议对照原卷',
            'body': [body], 'paras': [], 'bank': bank, 'questions': questions}


def normalized(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())


def read_line_pages(number):
    path = CACHE / f'202606-lines-{number}.json'
    if not path.exists():
        cached_packages = ROOT / 'tools' / '.cache' / 'ocr-env'
        if cached_packages.exists():
            sys.path.insert(0, str(cached_packages))
        import cv2
        import fitz
        import numpy as np
        from rapidocr_onnxruntime import RapidOCR

        pdf = next((MATERIALS / '六级真题' / '六级真题').glob(
            f'2026年06*/**/2026.06六级真题第{number}套*.pdf'))
        engine = RapidOCR()
        pages = []
        with fitz.open(pdf) as document:
            for index in range(2, len(document)):
                pixmap = document[index].get_pixmap(dpi=150, alpha=False)
                image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
                ink_rows = np.where((gray < 180).sum(axis=1) > 3)[0]
                groups = []
                for y in ink_rows:
                    if not groups or y > groups[-1][-1] + 3:
                        groups.append([y])
                    else:
                        groups[-1].append(y)
                ranges = [(int(group[0]), int(group[-1])) for group in groups if len(group) > 3]
                crops = [image[max(0, y - 3):min(image.shape[0], z + 4), 30:-30] for y, z in ranges]
                result, _ = engine.text_recognizer(crops)
                pages.append({'page': index + 1, 'items': [
                    {'y': y, 'text': text, 'confidence': float(score)}
                    for (y, _), (text, score) in zip(ranges, result)]})
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(pages, ensure_ascii=False), encoding='utf-8')
    pages = json.loads(path.read_text(encoding='utf-8'))
    if [page['page'] for page in pages] != list(range(3, 10)):
        raise ValueError(f'Incomplete line recognition: {path}')
    return pages


def make_reading(number, line_pages, low, match_key, reading_keys):
    rows = []
    for page in line_pages:
        reference = low[page['page'] - 1]['items']
        for item in page['items']:
            value = item['text'].strip()
            nearby = [candidate['text'].strip() for candidate in reference
                      if abs(candidate['box'][0][1] * 150 / 180 - item['y']) < 20]
            scores = [(difflib.SequenceMatcher(None, normalized(value), normalized(candidate)).ratio(), candidate)
                      for candidate in nearby if normalized(candidate)]
            score, candidate = max(scores, default=(0, ''))
            if score >= 0.90:
                value = candidate
            if '六级真题' in value or re.fullmatch(r'\s*\d{1,2}\s*', value):
                continue
            value = re.sub(r'^([345])\s*[oO]\s*\.', lambda match: match.group(1) + '0.', value)
            value = re.sub(r'^([A-M])\)\s*', r'\1) ', value)
            value = re.sub(r'^(3[6-9]|4\d|5[0-5])\.\s*', r'\1. ', value)
            value = re.sub(r'^Passage\s*Two\b', 'Passage Two', value, flags=re.I)
            if re.match(r'^Part\s*Translation', value, re.I):
                value = 'Part IV Translation'
            rows.append(value)
    section_b = next(i for i, value in enumerate(rows) if value == 'Section B')
    paragraphs, questions = parse_exam_match('more than once.\n' + '\n'.join(rows[section_b:]), match_key)
    if number == 1:
        questions[4]['stem'] = questions[4]['stem'].replace('populartourist', 'popular tourist')
    result = [{'id': f'personal-cet6-202606-{number}-match', 'type': 'match',
               'test': f'2026年6月六级真题 · 第{number}套', 'no': 0, 'title': '段落匹配',
               'source': '本机原卷逐行扫描识别，文字建议对照原卷',
               'body': [], 'paras': paragraphs, 'bank': [], 'questions': questions}]
    for passage, first, key in [(1, 46, reading_keys[0]), (2, 51, reading_keys[1])]:
        body, questions = parse_docx_reading(rows, first, key)
        if any(len(option['t']) > 500 for question in questions for option in question['options']):
            raise ValueError(f'Scanned reading option includes unrelated text: {number}/{passage}')
        if number == 1 and passage == 1:
            questions[1]['options'][3]['t'] = 'They spend half as many hours on social media as British teenage boys.'
        if number == 1 and passage == 2:
            questions[3]['options'][0]['t'] = 'The alignment of corporate taxes with consumption taxes.'
            questions[4]['options'][0]['t'] = 'It would be solved with more countries cutting tax rates.'
            questions[4]['options'][2]['t'] = 'It would cease to exist with worldwide corporate support.'
        if number == 2 and passage == 2:
            questions[4]['options'][2]['t'] = 'Parents should provide guidance to their teens in the use of social media.'
        result.append({'id': f'personal-cet6-202606-{number}-reading-{passage}', 'type': 'reading',
                       'test': f'2026年6月六级真题 · 第{number}套', 'no': passage,
                       'title': f'仔细阅读 · Passage {passage}', 'source': '本机原卷逐行扫描识别，文字建议对照原卷',
                       'body': [body], 'paras': [], 'bank': [], 'questions': questions})
    return result


def make_listening(number, high, low, answers):
    candidates = []
    for page in low[:3]:
        for item in page['items']:
            value = item['text']
            marks = list(re.finditer(r'(?<![A-Za-z])([A-D])\)\s*', value))
            for i, mark in enumerate(marks):
                option = clean(value[mark.end():marks[i+1].start() if i+1 < len(marks) else len(value)])
                if option:
                    candidates.append((mark.group(1), option))
    pages = []
    for page in high[:3]:
        lines = []
        for item in page['items']:
            value = re.sub(r'^([0-9]+)\s*\.\s*', r'\1. ', item['text'].strip())
            lines.append((item['box'][0][0], item['box'][0][1], value))
        cutoff = min([y for x, y, value in lines
                      if page['page'] == 3 and re.match(r'^Part\s+I+', value)] or [float('inf')])
        lines = [(x, y, value) for x, y, value in lines if y < cutoff]
        if number == 2 and page['page'] == 2:
            # These two lines were missed by both OCR passes; transcribed from page 2.
            x, _ = next((x, y) for x, y, value in lines if value.startswith('12. A)'))
            following = next(y for x, y, value in lines if value.startswith('13. A)'))
            baseline = next(y for x, y, value in lines if value.startswith('B) It is any basic'))
            gap = (following - baseline) / 3
            lines.extend([(x, baseline + gap, 'C) It is any symmetrical and colorful stripes or spots on organisms.'),
                          (x, baseline + 2 * gap, 'D) It is any regularly repeated arrangement of shapes or colors.')])
            lines.sort(key=lambda line: (line[1], line[0]))
        pages.append(lines)
    questions = parse_pdf_listening(pages, answers)
    for question in questions:
        for option in question['options']:
            scores = [(difflib.SequenceMatcher(None, normalized(option['t']), normalized(value)).ratio(), value)
                      for key, value in candidates if key == option['k']]
            score, value = max(scores, default=(0, ''))
            if score >= 0.84:
                option['t'] = value
        if number == 1 and question['n'] == 3:
            question['options'][3]['t'] = 'Demonstrate final results.'
        if number == 1 and question['n'] == 17:
            question['options'][0]['t'] = 'It warned consumers not to eat fish from the Gulf of Mexico.'
            question['options'][1]['t'] = 'It called on expectant mothers to pay attention to food safety.'
    audio = next((MATERIALS / '六级真题' / '六级真题').glob(
        f'2026年06*/**/2026年6月英语六级听力第{number}套.mp3'))
    return {'id': f'personal-cet6-202606-{number}-listening', 'type': 'listening',
            'test': f'2026年6月六级真题 · 第{number}套', 'no': 0,
            'title': f'听力真题 · 第{number}套', 'source': '本机原卷扫描识别，文字建议对照原卷',
            'audio': audio.relative_to(MATERIALS).as_posix(), 'body': [], 'paras': [],
            'bank': [], 'questions': questions}


def main():
    sets = []
    for number, (cloze_key, listening_key, match_key, reading_keys) in KEYS.items():
        low, high = read_pages(number, 'raw'), read_pages(number, 'hi')
        sets.append(make_cloze(number, low, cloze_key))
        sets.append(make_listening(number, high, low, listening_key))
        sets.extend(make_reading(number, read_line_pages(number), low, match_key, reading_keys))
    OUTPUT.write_text(json.dumps({'version': 1, 'sets': sets}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Generated {len(sets)} local scan sets / {sum(len(s["questions"]) for s in sets)} questions: {OUTPUT}')


if __name__ == '__main__':
    main()
