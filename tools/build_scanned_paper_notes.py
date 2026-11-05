"""Extract answer-checked notes from locally recognized exam answer books.

The original OCR results are local cache files.  Ambiguous question numbers,
answer mismatches and incomplete passages are omitted for later review.
"""
import json
import re
from pathlib import Path
from build_paper_notes import format_translation

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache' / 'pdf_probe'


def footer(line):
    return bool(re.match(r'^\s*(?:(?:\d{1,3}\s*)?六级\s*20\d\d|第\s*\d+\s*页|(?:20)?\d{2}年\s*\d+月六级|解析册[·•].*六级|[.·卜]*\s*第\s*[123]\s*套\s*$|[.·卜]*\s*第\s*$|[123]\s*套\s*$|[\d口]{1,4}\s*$)', line))


def tidy(lines):
    return ''.join(line.strip() for line in lines if line.strip() and not footer(line)).strip()


def parse_cloze(lines, answers):
    header = re.compile(r'^\s*(2[6-9]|3[0-5])\s*[.．。]\s*([A-O])\s*[)）]')
    result = {}
    for i, line in enumerate(lines):
        match = header.match(line)
        if not match:
            continue
        n, letter = int(match.group(1)), match.group(2)
        if n not in answers or answers[n][0] != letter:
            continue
        body = []
        for nextline in lines[i + 1:i + 45]:
            if header.match(nextline) or re.search(r'全文翻译|Section\s*B|概览', nextline, re.I):
                break
            body.append(nextline)
        value = tidy(body)
        if value.count('语义判断') != 1 or value.count('语法判断') != 1:
            continue
        if answers[n][1].lower() not in re.sub(r'\s+', '', value).lower():
            continue
        if 30 <= len(value) <= 900:
            result[n] = '【解析册扫描识别】' + value
    return result


def parse_matching(lines, answers):
    header = re.compile(r'^\s*(3[6-9]|4[0-5])\s*[.．。]')
    result = {}
    for i, line in enumerate(lines):
        head = header.match(line)
        if not head:
            continue
        n = int(head.group(1))
        if n not in answers:
            continue
        body = [line[head.end():]]
        for nextline in lines[i + 1:i + 45]:
            if header.match(nextline) or re.search(r'Section\s*C|Passage\s*One|全文翻译', nextline, re.I):
                break
            body.append(nextline)
        block = '\n'.join(body)
        match = re.search(r'(?:答案解(?:析)?\s*|^|\n)\s*([A-P])\s*[。．.]\s*((?:由|根据)题.*)', block, re.S)
        if not match or match.group(1) != answers[n]:
            continue
        value = tidy(match.group(2).splitlines()).replace('答案解析', '')
        value = re.split(r'题干译文|Section\s*[A-C]?\s*$', value, maxsplit=1, flags=re.I)[0]
        if 35 <= len(value) <= 700 and '题干' in value and not re.search(r'\d{2}\s*[.．。]\s*题干译文', value):
            result[n] = '【解析册扫描识别】' + value
    return result


def parse_reading(lines, answers):
    header = re.compile(r'^\s*(4[6-9]|5[0-5])\s*[.．。]')
    result = {}
    for i, line in enumerate(lines):
        head = header.match(line)
        if not head or int(head.group(1)) not in answers:
            continue
        number = int(head.group(1))
        block = []
        for nextline in lines[i + 1:i + 100]:
            if header.match(nextline) or '全文翻译' in nextline or re.search(r'Passage\s*Two|Part\s*IV', nextline, re.I):
                break
            block.append(nextline)
        options = [(index, match.group(1)) for index, row in enumerate(block)
                   for match in re.finditer(r'(?<![A-Za-z])([A-D])\s*[)）]', row)]
        if sorted(letter for _, letter in options) != list('ABCD'):
            continue
        rationale = tidy(block[options[-1][0] + 1:])
        if re.search(r'定位(?:至|于).{0,12}段。才能', rationale):
            continue
        positive = re.findall(r'(?:答案为\s*([A-D])|(?:选项)?([A-D])\s*项?\s*(?:符合(?:题意|文意)|与[^，。]{0,16}(?:一致|相符)|是对[^。]{0,45}(?:同义转述|概括)|是[^。]{0,16}正确|为正确答案)|故选(?:项)?\s*([A-D]))', rationale)
        stated = {letter for match in positive for letter in match if letter}
        if stated != {answers[number]} or not 35 <= len(rationale) <= 1200:
            continue
        result[number] = '【解析册扫描识别】' + rationale
    return result


def parse_single_column_listening(lines, answers):
    header = re.compile(r'^\s*([1-9]|1[0-9]|2[0-5])\s*[.．。]')
    result = {}
    for i, line in enumerate(lines):
        head = header.match(line)
        if not head or int(head.group(1)) not in answers:
            continue
        number = int(head.group(1))
        block = []
        for row in lines[i + 1:i + 100]:
            if header.match(row) or '听力原文' in row or '全文翻译' in row:
                break
            block.append(row)
        options = [(index, match.group(1)) for index, row in enumerate(block)
                   for match in re.finditer(r'(?<![A-Za-z])([A-D])\s*[)）]', row)]
        if sorted(letter for _, letter in options) != list('ABCD'):
            continue
        value = tidy(row for row in block[options[-1][0] + 1:] if not re.fullmatch(r'析\s*\d*', row.strip()))
        stated = re.findall(r'(?:由此可知|可知|因此|所以|故|显然)[，,:：\s]*(?:选项)?([A-D])\s*项?\s*(?:与.{0,16}相符|符合|正确|为正确)|(?:选项)?([A-D])\s*项?\s*为正确答案|故选(?:项)?\s*([A-D])', value)
        positive = {letter for group in stated for letter in group if letter}
        if positive != {answers[number]} or not 35 <= len(value) <= 1000 or not re.search(r'[。！？.!?）)]$', value):
            continue
        result[number] = '【解析册扫描识别】' + value
    return result


def extract_translation(lines, marker_index):
    body = []
    for line in lines[marker_index + 1:]:
        if '答案详解' in line or re.search(r'^\s*Section\s*[BC]\b', line, re.I):
            break
        body.append(line)
    return tidy(body)


def complete_matching_translation(text):
    labels = list(re.finditer(r'(?<![A-Za-z])([A-P])[)）\]]', text))
    if not labels or not re.search(r'[。！？.!?\"”’）)]$', text):
        return False
    return all(re.search(r'[。！？.!?\"”’）)]\s*$', text[max(0, label.start()-25):label.start()])
               for label in labels[1:])


def extract_reference_translation(lines, marker_index, index):
    stops = [r'^\s*Section\s*B\b', r'^\s*Section\s*C\b',
             r'^\s*Passage\s*Two\b', r'^\s*(?:Part\s*(?:IV|N|V|Ⅳ)|Translation\s*$)']
    end = next((i for i in range(marker_index + 1, len(lines)) if re.search(stops[index], lines[i], re.I)), None)
    if end is None and index != 3:
        return None
    text = tidy(lines[marker_index + 1:end])
    if not text or not re.search(r'[。！？.!?\"”’）)]$', text):
        return None
    if index == 1 and not complete_matching_translation(text):
        return None
    return text


def ordered_items(items):
    rows = []
    for item in sorted(items, key=lambda it: it['box'][0][1]):
        box = item['box']
        top = min(point[1] for point in box)
        bottom = max(point[1] for point in box)
        height = max(4, bottom - top)
        center = (top + bottom) / 2
        if rows and abs(center - rows[-1]['center']) <= max(height, rows[-1]['height']) * .55:
            rows[-1]['items'].append(item)
        else:
            rows.append({'center': center, 'height': height, 'items': [item]})
    return [item for row in rows for item in sorted(row['items'], key=lambda it: it['box'][0][0])]


def column_lines(pages):
    lines = []
    for page in sorted(pages, key=lambda p: p['page']):
        for right in (False, True):
            items = [it for it in page['items']
                     if (it['box'][0][0] >= page['width'] * .5) == right
                     and it['box'][0][1] < page['height'] * .95 and it['confidence'] >= .5]
            lines.extend(it['text'].strip() for it in ordered_items(items)
                         if it['text'].strip() and not footer(it['text']))
    return lines


def extract_2026_translations(pages):
    translations, body = [], None
    for page in sorted(pages, key=lambda p: p['page']):
        for item in ordered_items(page['items']):
            text = item['text'].strip()
            if item['box'][0][1] >= page['height'] * .945:
                continue
            if '答案详解' in text and (item['box'][0][1] > page['height'] * .9 or re.search(r'共\s*3\s*套', text)):
                continue
            if '全文翻译' in text:
                if body is not None:
                    translations.append(None)
                body = []
                continue
            if body is None:
                continue
            if '核心词汇' in text or ('答案详解' in text and '共3' not in text):
                value = tidy(body)
                translations.append(value if len(value) >= 250 else None)
                body = None
            elif not re.search(r'/{4,}', text) and not footer(text):
                body.append(text)
    if body is not None:
        translations.append(None)
    return translations


def lines_2026(pages, columns):
    lines = []
    for page in sorted(pages, key=lambda p: p['page']):
        items = [it for it in page['items'] if it['box'][0][1] < page['height'] * .945
                 and not footer(it['text'])
                 and not ('答案详解' in it['text'] and (it['box'][0][1] > page['height'] * .9
                                                         or re.search(r'共\s*3\s*套', it['text'])))]
        if not columns:
            lines.extend(it['text'] for it in ordered_items(items))
            continue
        headings = [it['box'][0][1] for it in items if '答案详解' in it['text']]
        if any('全文翻译' in it['text'] for it in items):
            headings += [it['box'][0][1] for it in items if re.match(r'^\s*(?:26|36)\s*[.．。]', it['text'])]
        boundaries = [0] + sorted(set(headings)) + [page['height']]
        for low, high in zip(boundaries, boundaries[1:]):
            for right in (False, True):
                part = [it for it in items if low <= it['box'][0][1] < high
                        and (it['box'][0][0] >= page['width'] * .5) == right]
                lines.extend(it['text'] for it in ordered_items(part))
    return lines


def parse_2026_explanations(lines, answers):
    header = re.compile(r'^\s*([1-9]|[1-4][0-9]|5[0-5])\s*[.．。]')
    result = {}
    for index, line in enumerate(lines):
        start = header.match(line)
        if not start or int(start.group(1)) not in answers:
            continue
        number = int(start.group(1))
        parts = [line[start.end():]]
        for following in lines[index + 1:index + 120]:
            if header.match(following) or '全文翻译' in following or re.search(r'^\s*(?:Section\s*[BC]|Passage\s*Two|Part\s*(?:IV|V|N))\b', following, re.I):
                break
            if not re.search(r'/{4,}', following):
                parts.append(following)
        text = tidy(parts)
        match = re.search(r'答案为\s*([A-P])\s*[)）]', text)
        if not match or match.group(1) != answers[number]:
            continue
        value = re.split(r'干扰项排除', text[match.end():], maxsplit=1)[0].lstrip(' 。.）)|匮回答案解析').rstrip(' \t\r\n|')
        if 35 <= len(value) <= 1200 and re.search(r'[。！？.!?）)]$', value):
            result[number] = '【解析册文本识别】' + value
    return result


def parse_column_explanations(lines, answers, kind):
    header = re.compile(r'^\s*([1-9]|[1-4][0-9]|5[0-5])\s*[.．。]')
    result = {}
    for index, line in enumerate(lines):
        start = header.match(line)
        if not start:
            continue
        n = int(start.group(1))
        if n not in answers:
            continue
        parts = [line[start.end():]]
        for following in lines[index + 1:index + 100]:
            if header.match(following) or '参考译文' in following or re.search(r'^\s*(?:Section\s*[BC]|Passage\s*Two|Part\s*(?:IV|V|N))\b', following, re.I):
                break
            parts.append(following)
        text = tidy(parts)
        explicit = re.findall(r'答案为\s*([A-P])\s*[)）]?', text)
        if explicit and explicit[-1] != answers[n]:
            continue
        if kind == 'cloze':
            match = re.search(r'([A-O])\s*[)）]\s*[【\[]语法判断[】\]]', text)
            if not match or match.group(1) != answers[n] or text.count('语义判断') != 1:
                continue
            value = text[match.end() - len('【语法判断】'):]
        else:
            if text.count('精析') != 1:
                continue
            match = re.search(r'([A-P])\s*[)）]\s*[【\[]精析[】\]]', text)
            stated = match.group(1) if match else (explicit[-1] if explicit else None)
            if stated != answers[n]:
                continue
            pos = text.find('【定位】')
            if pos < 0:
                pos = text.find('【精析】')
            if pos < 0:
                continue
            value = text[pos:].split('【避错】', 1)[0]
        if 30 <= len(value) <= 1200 and not re.search(r'参考译文|答案详解|\d{2}\s*[.．。]【(?:定位|考点)】', value):
            result[n] = '【解析册扫描识别】' + value
    return result


def reading_translation(pages, start_page):
    pages = {page['page']: page for page in pages}
    if start_page not in pages:
        return None
    first = pages[start_page]
    starts = [it for it in first['items'] if '全文翻译' in it['text']]
    if len(starts) != 1:
        return None
    first_y = starts[0]['box'][0][1]
    same_page_end = [it['box'][0][1] for it in first['items']
                     if '答案详解' in it['text'] and it['box'][0][1] > first_y]
    if same_page_end:
        segments = [(first, first_y + 1, min(same_page_end))]
    else:
        second = pages.get(start_page + 1)
        if not second:
            return None
        ends = [it['box'][0][1] for it in second['items'] if '答案详解' in it['text']]
        if not ends:
            return None
        segments = [(first, first_y + 1, first['height'] * .94), (second, 0, min(ends))]
    selected = []
    for page, lo, hi in segments:
        items = ordered_items(page['items'])
        for item in items:
            x, y = item['box'][0]
            text = item['text'].strip()
            if lo < y < hi and x < page['width'] * .99 and item['confidence'] >= .5 and text and not footer(text):
                selected.append(text)
    value = tidy(selected)
    if re.search(r'重难点单词|单词及短语|[·•][A-Za-z]+\s*(?:n\.|v\.|adj\.|adv\.)', value):
        return None
    return value if 300 <= len(value) <= 3000 and len(re.findall(r'[\u4e00-\u9fff]', value)) >= 250 else None


def main():
    source = ROOT / '星火六级' / '英语学习站-自动判分题库.json'
    sets = {item['id']: item for item in json.loads(source.read_text(encoding='utf-8'))['sets']}
    notes = {}
    for yearmonth in ('202312', '202406', '202506'):
        for number in (1, 2, 3):
            cache_kind = 'reading' if yearmonth == '202506' else 'answers'
            pages = json.loads((CACHE / f'{yearmonth}-{cache_kind}-{number}.json').read_text(encoding='utf-8'))
            lines = [line for page in pages for line in page['lines']]
            markers = [i for i, line in enumerate(lines) if '全文翻译' in line]
            marker_pages = [page['page'] for page in pages for line in page['lines'] if '全文翻译' in line]
            if len(markers) != 4:
                raise ValueError(f'Incomplete translation markers for {yearmonth}-{number}')
            prefix = f'personal-cet6-{yearmonth}-{number}'
            geometry_file = CACHE / f'{yearmonth}-note-clipped-{number}.json'
            geometry = json.loads(geometry_file.read_text(encoding='utf-8')) if geometry_file.exists() else []
            for index, suffix in enumerate(('cloze', 'match', 'reading-1', 'reading-2')):
                key = prefix + '-' + suffix
                if key not in sets:
                    continue
                item = sets[key]
                if index < 2:
                    translation = extract_translation(lines, markers[index])
                    if index == 1:
                        tags = re.findall(r'(?<![A-Za-z])([A-P])[)）\]]', translation)
                        if len(set(tags)) < max(3, len(item['paras']) * .75) or not complete_matching_translation(translation):
                            translation = None
                else:
                    translation = reading_translation(geometry, marker_pages[index])
                note = {}
                if translation and 250 <= len(translation) <= 3000:
                    note['translation'] = format_translation(translation, index == 1)
                    note['translationSource'] = 'scan'
                answers = {q['n']: q['answer'] for q in item['questions']}
                if index == 0:
                    bank = {word['k']: word['w'] for word in item['bank']}
                    explanations = parse_cloze(lines, {n: (answer, bank[answer]) for n, answer in answers.items()})
                elif index == 1:
                    explanations = parse_matching(lines, answers)
                else:
                    explanations = parse_reading(lines, answers)
                if explanations:
                    note['explanations'] = explanations
                    note['answers'] = {n: answers[n] for n in explanations}
                if note:
                    notes[key] = note
    for yearmonth in ('202212', '202303', '202306', '202412'):
        for number in (1, 2, 3):
            cache = CACHE / f'{yearmonth}-answers-{number}.json'
            if not cache.exists():
                continue
            pages = json.loads(cache.read_text(encoding='utf-8'))
            lines = [line for page in pages for line in page['lines']]
            markers = [i for i, line in enumerate(lines) if line.strip().startswith('参考译文')
                       and '难点' not in line and len(line) < 15]
            if len(markers) not in (3, 4):
                continue
            prefix = f'personal-cet6-{yearmonth}-{number}'
            for index, suffix in enumerate(('cloze', 'match', 'reading-1', 'reading-2')):
                key = prefix + '-' + suffix
                if key not in sets or index >= len(markers):
                    continue
                translation = extract_reference_translation(lines, markers[index], index)
                if not translation or not 250 <= len(translation) <= 3000:
                    continue
                if index == 1:
                    tags = re.findall(r'(?<![A-Za-z])([A-P])[)）\]]', translation)
                    if len(set(tags)) < max(3, len(sets[key]['paras']) * .75):
                        continue
                # This source loses an entire line in the last paragraph; leave it for review.
                if key == 'personal-cet6-202212-2-reading-2' and '正如与更年幼到的内容' in translation:
                    continue
                notes.setdefault(key, {}).update({'translation': format_translation(translation, index == 1), 'translationSource': 'scan'})
            geometry = CACHE / f'{yearmonth}-answer-columns-{number}.json'
            if geometry.exists():
                ordered = column_lines(json.loads(geometry.read_text(encoding='utf-8')))
                for suffix in ('listening', 'cloze', 'match', 'reading-1', 'reading-2'):
                    key = prefix + '-' + suffix
                    if key not in sets:
                        continue
                    answers = {q['n']: q['answer'] for q in sets[key]['questions']}
                    explanations = parse_column_explanations(ordered, answers, 'cloze' if suffix == 'cloze' else 'match')
                    if explanations:
                        notes.setdefault(key, {}).update({'explanations': explanations,
                                                         'answers': {n: answers[n] for n in explanations}})
    for yearmonth in ('202106', '202112', '202206', '202209', '202606'):
        for number in (1, 2, 3):
            geometry = CACHE / f'{yearmonth}-{"scan-columns" if yearmonth == "202106" else "answer-columns"}-{number}.json'
            if not geometry.exists():
                continue
            pages = json.loads(geometry.read_text(encoding='utf-8'))
            ordered = column_lines(pages)
            prefix = f'personal-cet6-{yearmonth}-{number}'
            translations_2026 = extract_2026_translations(pages) if yearmonth == '202606' else []
            if yearmonth == '202606' and len(translations_2026) == 4:
                for index, suffix in enumerate(('cloze', 'match', 'reading-1', 'reading-2')):
                    key = prefix + '-' + suffix
                    value = translations_2026[index]
                    corrections = {
                        'personal-cet6-202606-3-reading-1': [('笙ffrj ，且于', '然而，由于')],
                        'personal-cet6-202606-3-reading-2': [('而且向于电价', '而且由于电价')],
                    }
                    for wrong, correct in corrections.get(key, []):
                        if value:
                            value = value.replace(wrong, correct)
                    if key in sets and value and 250 <= len(value) <= 3000 and re.search(r'[。！？.!?\"”’）)]$', value) and not re.search(r'[A-Za-z]{3,}\s*[，。]\s*[且或而]$', value):
                        notes.setdefault(key, {}).update({'translation': format_translation(value, index == 1),
                                                         'translationSource': 'scan'})
            for suffix in ('listening', 'cloze', 'match', 'matching', 'reading-1', 'reading-2'):
                key = prefix + '-' + suffix
                if key not in sets:
                    continue
                answers = {q['n']: q['answer'] for q in sets[key]['questions']}
                if yearmonth == '202606':
                    explanations = parse_2026_explanations(lines_2026(pages, suffix in ('cloze', 'match')), answers)
                else:
                    explanations = parse_column_explanations(ordered, answers, 'cloze' if suffix == 'cloze' else 'match')
                if explanations:
                    notes.setdefault(key, {}).update({'explanations': explanations,
                                                     'answers': {n: answers[n] for n in explanations}})
    for yearmonth in ('202312', '202406', '202506', '202512'):
        for number in (1, 2):
            kind = 'answers' if yearmonth in ('202312', '202406') else 'listening'
            cache = CACHE / f'{yearmonth}-{kind}-{number}.json'
            key = f'personal-cet6-{yearmonth}-{number}-listening'
            if not cache.exists() or key not in sets:
                continue
            pages = json.loads(cache.read_text(encoding='utf-8'))
            lines = [line for page in pages for line in page['lines']]
            answers = {q['n']: q['answer'] for q in sets[key]['questions']}
            explanations = parse_single_column_listening(lines, answers)
            if explanations:
                notes.setdefault(key, {}).update({'explanations': explanations,
                                                 'answers': {n: answers[n] for n in explanations}})
    for number in (1, 2, 3):
        chunks = []
        for kind in ('listening', 'sectionab', 'key'):
            cache = CACHE / f'202512-{kind}-{number}.json'
            if cache.exists():
                chunks.extend(json.loads(cache.read_text(encoding='utf-8')))
        pages = {page['page']: page for page in chunks}
        lines = [line for page in sorted(pages.values(), key=lambda p: p['page']) for line in page['lines']]
        markers = [i for i, line in enumerate(lines) if '全文翻译' in line]
        marker_pages = [page['page'] for page in sorted(pages.values(), key=lambda p: p['page'])
                        for line in page['lines'] if '全文翻译' in line]
        geometry_file = CACHE / f'202512-note-clipped-{number}.json'
        geometry = json.loads(geometry_file.read_text(encoding='utf-8')) if geometry_file.exists() else []
        prefix = f'personal-cet6-202512-{number}'
        for index, suffix in enumerate(('cloze', 'match', 'reading-1', 'reading-2')):
            key = prefix + '-' + suffix
            if key not in sets:
                continue
            item = sets[key]
            note = notes.setdefault(key, {})
            if index < 2 and len(markers) >= 2:
                translation = extract_translation(lines, markers[index])
                if index == 1:
                    tags = re.findall(r'(?<![A-Za-z])([A-P])[)）\]]', translation)
                    if len(set(tags)) < max(3, len(item['paras']) * .75) or not complete_matching_translation(translation):
                        translation = None
                if translation and 250 <= len(translation) <= 3000:
                    note.update({'translation': format_translation(translation, index == 1), 'translationSource': 'scan'})
            elif index >= 2 and len(marker_pages) == 4:
                translation = reading_translation(geometry, marker_pages[index])
                # These pages place text outside the clipped column or mix in marginal
                # vocabulary; use neither an incomplete sentence nor stray glossary text.
                if key in {'personal-cet6-202512-1-reading-2',
                           'personal-cet6-202512-2-reading-1',
                           'personal-cet6-202512-3-reading-1',
                           'personal-cet6-202512-3-reading-2'}:
                    translation = None
                if translation and 250 <= len(translation) <= 3000:
                    note.update({'translation': format_translation(translation, False), 'translationSource': 'scan'})
            answers = {q['n']: q['answer'] for q in item['questions']}
            if index == 0:
                bank = {word['k']: word['w'] for word in item['bank']}
                explanations = parse_cloze(lines, {n: (answer, bank[answer]) for n, answer in answers.items()})
            elif index == 1:
                explanations = parse_matching(lines, answers)
            else:
                explanations = parse_reading(lines, answers)
            if explanations:
                note.update({'explanations': explanations, 'answers': {n: answers[n] for n in explanations}})
            if not note:
                del notes[key]
    # This answer book has four readable reference translations in the text layer.
    import fitz
    directory = next((ROOT / '星火六级' / '六级真题' / '六级真题').glob('2022年09*'))
    pdf = next(p for p in directory.rglob('*.pdf') if '解析' in p.name and '第1套' in p.name)
    with fitz.open(pdf) as document:
        lines = [line for page in document for line in page.get_text().splitlines()]
    markers = [i for i, line in enumerate(lines) if line.strip() == '参考译文']
    if len(markers) == 4:
        for index, suffix in enumerate(('cloze', 'match', 'reading-1', 'reading-2')):
            key = 'personal-cet6-202209-1-' + suffix
            if key not in sets:
                continue
            translation = extract_reference_translation(lines, markers[index], index)
            if translation and 250 <= len(translation) <= 3000:
                notes.setdefault(key, {}).update({'translation': format_translation(translation, index == 1),
                                                 'translationSource': 'scan'})
    out = ROOT / 'data' / 'personal-scan-notes.js'
    out.write_text('window.TW_PAPER_SCAN_NOTES = ' + json.dumps(notes, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Prepared {sum(bool(n.get("translation")) for n in notes.values())} scanned translations and '
          f'{sum(len(n.get("explanations", {})) for n in notes.values())} answer-checked explanations.')


if __name__ == '__main__':
    main()
