"""Extract reviewed reference translations and rationales from local answer books."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = ROOT / '星火六级' / '六级真题' / '六级真题'


def clean_translation(text):
    text = re.sub(r'[\U000F0000-\U0010FFFF]', '', text)
    text = re.sub(r'(?m)^\s*(?:\d{1,2}|[·\s]+)\s*$', '', text)
    text = re.sub(r'\s*\n\s*', '', text).strip('· \t\r\n')
    return text


def format_translation(text, matching):
    if matching:
        return re.sub(r'(?<!^)(?=(?:\[[A-P]\]|[A-P][)）]))', '\n', text).strip()
    result, start = [], 0
    for match in re.finditer(r'[。！？]', text):
        if match.end() - start >= 200:
            result.append(text[start:match.end()])
            start = match.end()
    if start < len(text):
        result.append(text[start:])
    return '\n'.join(result)


def extract_translations(text):
    markers = list(re.finditer('全文翻译', text))
    if len(markers) != 4:
        raise ValueError('Expected four reference translations')
    result = []
    for index, (marker, stop) in enumerate(zip(markers, [r'Section\s*B\b', r'Section\s*C\b', r'Passage\s*Two\b', r'Part\s*IV\b'])):
        tail = text[marker.end():]
        end = re.search(stop, tail, re.I)
        if not end:
            raise ValueError('Reference translation boundary is missing')
        value = clean_translation(tail[:end.start()])
        if not value:
            raise ValueError('Reference translation is empty')
        result.append(format_translation(value, index == 1))
    return result


def parse_explanations(text, answers, kind):
    result = {}
    for n, answer in answers.items():
        start = re.search(r'(?m)^\s*' + str(n) + r'\s*[.．。]', text)
        if not start:
            continue
        tail = text[start.end():]
        end = re.search(r'(?m)^\s*' + str(n + 1) + r'\s*[.．。]', tail)
        block = tail[:end.start()] if end else tail
        if kind == 'match':
            explanation = re.search(r'\[答案\]\s*\[?([A-Z])\]?\s*\[精解\](.*?)(?=\[(?:排除干扰|提炼思路|定位提示)\]|\Z)', block, re.S)
            if not explanation or explanation.group(1) != answer:
                continue
            value = explanation.group(2)
        else:
            explanation = re.search(r'\[锁定答案\](.*?)(?=\[排除干扰\]|\[提炼思路\]|\Z)', block, re.S)
            if not explanation:
                continue
            value = explanation.group(1)
        value = clean_translation(value)
        if len(value) >= 8:
            result[n] = value
    return result


def parse_scanned_explanations(text, answers, kind):
    result = {}
    for n, answer in answers.items():
        candidates = re.finditer(r'(?m)^\s*' + str(n) + r'\s*[.．。]', text)
        for start in candidates:
            tail = text[start.end():]
            end = re.search(r'(?m)^\s*' + str(n + 1) + r'\s*[.．。]', tail)
            block = tail[:end.start()] if end else tail[:3000]
            if kind == 'match':
                pattern = r'[【「\[]答案[】\]]\s*([A-P])\s*[【「\[]精解[】\]](.*?)(?=[【「\[]排除干扰[】\]]|\Z)'
            else:
                pattern = r'[【「\[]锁定答案[】\]]\s*([A-D])\s*[。．.]?\s*(.*?)(?=[【「\[]排除干扰[】\]]|\Z)'
            match = re.search(pattern, block, re.S)
            if not match or match.group(1) != answer:
                continue
            value = re.sub(r'(?m)^.*(?:淘宝店铺|光速考研工作室|第\s*\d+\s*[/／]\s*\d+\s*页).*$','',match.group(2))
            value = clean_translation(value)
            if 8 <= len(value) <= 1000:
                result[n] = value
                break
    return result


def main():
    import fitz
    bundle = json.loads((ROOT / '星火六级' / '英语学习站-自动判分题库.json').read_text(encoding='utf-8'))
    sets = {item['id']: item for item in bundle['sets']}
    notes = {}
    for year, month in [(2019, 12), (2020, 12)]:
        directory = next(MATERIALS.glob(f'{year}年{month:02d}*'))
        for number in (1, 2, 3):
            prefix = f'personal-cet6-{year}{month:02d}-{number}'
            if not any(key.startswith(prefix + '-') for key in sets):
                continue
            pdf = next(p for p in directory.rglob('*.pdf') if '解析' in p.name and f'第{number}套' in p.name)
            with fitz.open(pdf) as doc:
                text = '\n'.join(page.get_text() for page in doc)
            translations = extract_translations(text)
            markers = list(re.finditer('全文翻译', text))
            for index, suffix in enumerate(('cloze', 'match', 'reading-1', 'reading-2')):
                key = prefix + '-' + suffix
                if key not in sets:
                    continue
                item = sets[key]
                note = {'translation': translations[index]}
                if index:
                    region = text[markers[index-1].end():markers[index].start()]
                    answers = {q['n']: q['answer'] for q in item['questions']}
                    explanations = parse_explanations(region, answers, 'match' if index == 1 else 'reading')
                    if explanations:
                        note['explanations'] = explanations
                        note['answers'] = {number: answers[number] for number in explanations}
                notes[key] = note
    for month, number, filename in [
            (7, 1, '2020.07英语六级考试全1套解析.pdf'),
            (9, 1, '2020.09英语六级考试第1套解析.pdf'),
            (9, 2, '2020.09英语六级考试第2、3套解析.pdf')]:
        directory = next(MATERIALS.glob(f'2020年{month:02d}*'))
        pdf = next(directory.rglob(filename))
        with fitz.open(pdf) as doc:
            text = '\n'.join(page.get_text() for page in doc)
        prefix = f'personal-cet6-2020{month:02d}-{number}'
        for suffix in ('match', 'reading-1', 'reading-2'):
            key = prefix + '-' + suffix
            if key not in sets:
                continue
            answers = {q['n']: q['answer'] for q in sets[key]['questions']}
            explanations = parse_scanned_explanations(text, answers, 'match' if suffix == 'match' else 'reading')
            if explanations:
                notes[key] = {'explanations': explanations,
                              'answers': {n: answers[n] for n in explanations}}
    out = ROOT / 'data' / 'personal-notes.js'
    out.write_text('window.TW_PAPER_NOTES = ' + json.dumps(notes, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Prepared notes for {len(notes)} passages and {sum(len(n.get("explanations", {})) for n in notes.values())} questions.')


if __name__ == '__main__':
    main()
