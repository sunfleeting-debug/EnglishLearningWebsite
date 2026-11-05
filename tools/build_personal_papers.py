"""Build reviewed exercises from the user's local Spark collection.

The output remains in the source directory; the website reads it after the
user grants access. Only reviewed answer keys are accepted here.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = ROOT / '星火六级'
OUTPUT = MATERIALS / '英语学习站-自动判分题库.json'

# Checked against 2021.12英语六级解析第1套.pdf, pages 12–14.
ANSWERS = {
    46: ('D', '文章围绕雇主是否应该通过社交媒体筛选求职者展开，讨论了其中的利弊和注意事项。'),
    47: ('A', '第三段指出，不恰当的筛选可能涉及道德或法律问题。'),
    48: ('A', '第四段指出，脱离上下文的照片或评论可能损害求职者的机会。'),
    49: ('B', '第五段建议在法律允许的范围内使用社交媒体信息。'),
    50: ('C', '文章最后建议事先咨询管理层及法律团队。'),
    51: ('D', '报告显示，消费者越来越希望获得清晰、准确的产品信息。'),
    52: ('A', '第二段说明，新的标签策略强调产品中没有哪些成分。'),
    53: ('D', '文中指出，这类标签可能引起消费者对食品不必要的担忧。'),
    54: ('C', '文章指出，这种做法会削弱消费者信任并降低销量。'),
    55: ('B', '最后一段建议食品制造商谨慎使用此类声明。'),
}
MATCH_ANSWERS = {
    36: ('G', 'G 段提到管理层对产量计算失误及销毁旧库存的解释。'),
    37: ('B', 'B 段对比了销毁库存与低价销售对品牌的影响。'),
    38: ('K', 'K 段指出廉价仿冒品令奢侈品消费者望而却步。'),
    39: ('E', 'E 段说明员工购买旧库存及限制转售的规定。'),
    40: ('L', 'L 段讨论了奢侈品概念变化对传统品牌的挑战。'),
    41: ('D', 'D 段讲述了一位无法忍受销毁库存而离职的员工。'),
    42: ('F', 'F 段指出普通时尚品牌也会销毁未售出的衣服。'),
    43: ('J', 'J 段介绍了利用皮革边角料、减少浪费的合作。'),
    44: ('A', 'A 段说烧毁大量库存的消息引发投资者与消费者愤怒。'),
    45: ('H', 'H 段说时装秀后立即售卖的策略尚无显著销售效果的证据。'),
}
CLOZE = [('B', 'beyond', '活到 85 岁或更久，beyond 表示“超过”。'),
         ('H', 'noteworthy', '研究结果在考虑其他因素后仍然成立，这一点值得注意。'),
         ('A', 'affect', '这些因素可能影响乐观与长寿之间的关联。'),
         ('L', 'span', 'life span 意为“寿命”。'),
         ('J', 'premature', 'premature death 指过早死亡。'),
         ('M', 'specifically', '这项研究专门考察乐观与长寿的关系。'),
         ('C', 'conceded', '研究人员承认，考虑健康行为后关联有所减弱。'),
         ('E', 'foster', '乐观可能促进有益健康的习惯。'),
         ('D', 'correlation', '研究发现的是关联，并未证明因果关系。'),
         ('O', 'trait', '乐观可能是一种促进健康的心理特质。')]

# 2021.12 第 1 套，听力答案核对自解析册第 2–7 页。
LISTENING_KEY = 'ACBCDDDADCBCABACDBBDBCACA'

def clean(text):
    return re.sub(r'\s+', ' ', text).strip()

def parse_questions(text, start, end, answers):
    result = []
    for number in range(start, end + 1):
        if number not in answers or answers[number][0] not in 'ABCD':
            raise ValueError(f'Question {number} lacks a reviewed answer')
        match = re.search(r'(?m)^\s*' + str(number) + r'\.\s*(.*?)(?=^\s*' + str(number + 1) + r'\.|\Z)', text, re.S)
        if not match:
            raise ValueError(f'Question {number} missing')
        chunks = re.split(r'(?m)^\s*([A-D])\)\s*', match.group(1))
        if len(chunks) != 9 or chunks[1::2] != list('ABCD'):
            raise ValueError(f'Question {number} has incomplete or unexpected options')
        result.append({'n': number, 'stem': clean(chunks[0]),
                       'options': [{'k': chunks[i], 't': clean(chunks[i+1])} for i in range(1, 9, 2)],
                       'answer': answers[number][0], 'explain': answers[number][1]})
    return result

def parse_matching(text):
    passage, statements = text.split('36.', 1)
    statements = '36.' + statements.split('Section C', 1)[0]
    matches = list(re.finditer(r'(?m)^([A-L])\)\s+', passage))
    if [m.group(1) for m in matches] != list('ABCDEFGHIJKL'):
        raise ValueError('Matching passage has missing or duplicated paragraphs')
    paragraphs = [{'k': m.group(1), 'text': clean(passage[m.end():matches[i+1].start() if i+1 < len(matches) else len(passage)])}
                  for i, m in enumerate(matches)]
    questions = []
    for n in range(36, 46):
        m = re.search(r'(?m)^\s*' + str(n) + r'\.\s*(.*?)(?=^\s*' + str(n+1) + r'\.|\Z)', statements, re.S)
        if not m or n not in MATCH_ANSWERS:
            raise ValueError(f'Missing matching question or verified answer {n}')
        questions.append({'n': n, 'stem': clean(m.group(1)), 'options': [],
                          'answer': MATCH_ANSWERS[n][0], 'explain': MATCH_ANSWERS[n][1]})
    return paragraphs, questions

def parse_listening(paragraphs, answers):
    chunks, current = {}, None
    for raw in paragraphs:
        line = raw.strip()
        if re.match(r'^Part\s+III\b', line, re.I):
            break
        match = re.match(r'^(\d{1,2})\.\s*(.*)', line)
        if match and int(match.group(1)) in range(1, len(answers) + 1):
            current = int(match.group(1))
            if current in chunks:
                raise ValueError(f'Duplicate listening question {current}')
            chunks[current] = [match.group(2)]
        elif current and line and not re.match(r'^(?:Section\s|Directions\s*[:：]|Questions?\s)', line, re.I):
            chunks[current].append(line)
    questions = []
    for n, answer in enumerate(answers, 1):
        if n not in chunks or answer not in 'ABCD':
            raise ValueError(f'Incomplete listening question {n}')
        text = ' '.join(chunks[n])
        options = list(re.finditer(r'(?<![A-Za-z])([ABCD])\s*\)\s*', text))
        if sorted(m.group(1) for m in options) != list('ABCD'):
            raise ValueError(f'Incomplete listening options for question {n}')
        parsed = {m.group(1): clean(text[m.end():options[i + 1].start() if i + 1 < len(options) else len(text)]) for i, m in enumerate(options)}
        if not all(parsed.values()):
            raise ValueError(f'Empty listening option for question {n}')
        questions.append({'n': n, 'stem': f'第 {n} 题：问题在录音中播放。',
                          'options': [{'k': k, 't': parsed[k]} for k in 'ABCD'],
                          'answer': answer, 'explain': '答案已对照本机配套解析册；题目和问题以录音为准。'})
    return questions

def parse_pdf_listening(pages, answers):
    choices = {}
    previous = None
    for page in pages:
        cutoffs = [y for x, y, text in page if re.match(r'^Part\s+(?:III|HI|JU|in)\b', text, re.I)]
        cutoff = min(cutoffs) if cutoffs else float('inf')
        headers = []
        for x, y, text in page:
            match = re.match(r'^(\d{1,2})\.\s*[A-D]\)', text)
            if match and y < cutoff and 1 <= int(match.group(1)) <= len(answers):
                headers.append((y, int(match.group(1))))
        for x, y, text in page:
            if y >= cutoff or not re.match(r'^(?:\d{1,2}\.\s*)?[A-D]\)', text):
                continue
            labels = list(re.finditer(r'(?<![A-Za-z])([A-D])\)\s*', text))
            eligible = [(hy, n) for hy, n in headers if hy <= y + 2]
            number = max(eligible)[1] if eligible else previous
            if number is None:
                continue
            for i, match in enumerate(labels):
                key = match.group(1)
                value = clean(text[match.end():labels[i+1].start() if i+1 < len(labels) else len(text)])
                if key in choices.setdefault(number, {}):
                    raise ValueError(f'Duplicate PDF listening option {number} {key}')
                choices[number][key] = value
        if headers:
            previous = max(headers)[1]
    questions = []
    for n, answer in enumerate(answers, 1):
        options = choices.get(n, {})
        if sorted(options) != list('ABCD') or not all(options.values()) or answer not in 'ABCD':
            raise ValueError(f'Incomplete PDF listening question {n}: {options}')
        corrections = [(' fbr ', ' for '), ('fbcus', 'focus'), ('foreigns ervice', 'foreign service'),
                       ('his.country', 'his country'), ('agenfs', "agent's"), ('students5', "students'"),
                       ('animals5', "animals'"), ('get tom off', 'get torn off')]
        for key in options:
            for old, new in corrections:
                options[key] = options[key].replace(old, new)
        questions.append({'n': n, 'stem': f'第 {n} 题：问题在录音中播放。',
                          'options': [{'k': key, 't': options[key]} for key in 'ABCD'],
                          'answer': answer, 'explain': '答案已对照本机配套解析册；题目和问题以录音为准。'})
    return questions

def parse_docx_reading(paragraphs, start, answers):
    rows = [p.strip() for p in paragraphs if p.strip()]
    question_index = next(i for i, text in enumerate(rows) if re.match(r'^' + str(start) + r'\.', text))
    heading_index = max(i for i, text in enumerate(rows[:question_index]) if re.match(r'^Questions\s+' + str(start) + r'\s+to\s+', text, re.I))
    body = clean(' '.join(rows[heading_index + 1:question_index]))
    if len(body) < 10:
        raise ValueError('Missing reading passage')
    questions = []
    for n, answer in enumerate(answers, start):
        i = next(i for i, text in enumerate(rows) if re.match(r'^' + str(n) + r'\.', text))
        end = next((j for j in range(i + 1, len(rows)) if re.match(r'^(?:' + str(n + 1) + r'\.|Passage\s+Two\b|Part\s*IV\b)', rows[j], re.I)), len(rows))
        text = ' '.join(rows[i:end])
        marks = list(re.finditer(r'(?<![A-Za-z])([ABCD])\s*\)\s*', text))
        if sorted(m.group(1) for m in marks) != list('ABCD'):
            raise ValueError(f'Incomplete reading options for question {n}')
        stem = re.sub(r'^' + str(n) + r'\.\s*', '', text[:marks[0].start()]).strip()
        choices = {m.group(1): clean(text[m.end():marks[i+1].start() if i+1 < len(marks) else len(text)]) for i, m in enumerate(marks)}
        if not stem or not all(choices.values()) or answer not in 'ABCD':
            raise ValueError(f'Incomplete reading question {n}')
        questions.append({'n': n, 'stem': stem, 'options': [{'k': k, 't': choices[k]} for k in 'ABCD'],
                          'answer': answer, 'explain': '答案已对照本机配套解析册。'})
    return body, questions

def parse_exam_cloze(text, answers):
    region = text.split('more than once.', 1)[1].split('Section B', 1)[0]
    options = list(re.finditer(r'(?m)^\s*([A-O0])\)\s*([^\n]+)', region))
    if len(options) != 15:
        raise ValueError('Cloze word bank does not contain 15 options')
    bank = {('O' if m.group(1) == '0' else m.group(1)): clean(m.group(2)) for m in options}
    if sorted(bank) != list('ABCDEFGHIJKLMNO') or len(answers) != 10 or any(a not in bank for a in answers):
        raise ValueError('Cloze word bank or answers invalid')
    body = region[:options[0].start()]
    blank_re = r'(?<!\d)(2[6-9]|3[0-5])(?!\d|\s*%)'
    numbers = re.findall(blank_re, body)
    if numbers != [str(n) for n in range(26, 36)]:
        raise ValueError(f'Cloze blanks invalid: {numbers}')
    body = re.sub(blank_re, lambda m: '【' + m.group(1) + '】', body)
    questions = [{'n': n, 'stem': f'第 {n} 空', 'options': [], 'answer': answers[n-26],
                  'key': bank[answers[n-26]], 'explain': '答案已对照本机配套解析册。'} for n in range(26, 36)]
    return clean(body), [{'k': k, 'w': bank[k]} for k in 'ABCDEFGHIJKLMNO'], questions

def parse_exam_match(text, answers):
    region = text.split('more than once.', 1)[1].split('Section B', 1)[1]
    start = re.search(r'(?m)^\s*A\)\s+', region)
    end = re.search(r'(?m)^\s*36\.\s+', region)
    if not start or not end or end.start() <= start.start():
        raise ValueError('Matching passage missing')
    passage = region[start.start():end.start()]
    marks = list(re.finditer(r'(?m)^\s*([A-Z])\)\s+', passage))
    if not marks or [m.group(1) for m in marks] != list('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[:len(marks)]):
        raise ValueError('Matching paragraphs incomplete or out of order')
    paragraphs = [{'k': m.group(1), 'text': clean(passage[m.end():marks[i+1].start() if i+1 < len(marks) else len(passage)])} for i, m in enumerate(marks)]
    statements = region[end.start():].split('Section C', 1)[0]
    if len(answers) != 10 or any(a not in [p['k'] for p in paragraphs] for a in answers):
        raise ValueError('Matching answers refer to missing paragraphs')
    questions = []
    for n in range(36, 46):
        m = re.search(r'(?m)^\s*' + str(n) + r'\.\s*(.*?)(?=^\s*' + str(n+1) + r'\.|\Z)', statements, re.S)
        if not m:
            raise ValueError(f'Missing matching question {n}')
        questions.append({'n': n, 'stem': clean(m.group(1)), 'options': [], 'answer': answers[n-36], 'explain': '答案已对照本机配套解析册。'})
    return paragraphs, questions

def extract_writing_sections(rows):
    essay, translation = [], []
    section = None
    graph = False
    for text, has_image in rows:
        text = text.strip()
        if re.match(r'^Part\s*IV\b', text, re.I):
            section = 'translation'
            continue
        if re.match(r'^Part\s*I\b', text, re.I):
            section = 'essay'
            continue
        if re.match(r'^Part\s*(?:II\b|Ⅱ)', text, re.I) or (section == 'essay' and re.match(r'^(?:Section\s+A|提示[：:])', text, re.I)):
            section = None
            continue
        if section is None and re.match(r'^Directions\s*[：:]\s*For this part.*(?:write an essay|write a composition)', text, re.I):
            section = 'essay'
        if section == 'essay':
            graph = graph or has_image
            if text and not re.match(r'^Writing\s*\(?\d*', text, re.I):
                essay.append(text)
        elif section == 'translation' and re.search(r'[\u4e00-\u9fff]', text):
            translation.append(text)
    essay_text = clean(' '.join(essay))
    trans_text = ''.join(translation).strip()
    # Image/graph prompts and truncated prompts must be reviewed separately.
    if graph or len(essay_text) < 50 or len(essay_text) > 2000 or re.search(r'\b(?:graph|chart|table)\s+(?:below|above)\b', essay_text, re.I) or not re.search(r'\b(?:essay|write)\b', essay_text, re.I):
        essay_text = None
    if len(re.findall(r'[\u4e00-\u9fff]', trans_text)) < 10:
        trans_text = None
    return essay_text, trans_text

def collect_subjective():
    from docx import Document
    base = MATERIALS / '六级真题' / '六级真题'
    items = []
    seen = set()
    for directory in sorted(base.iterdir()):
        date = re.match(r'(20\d\d)年(\d{2})月', directory.name)
        if not date or int(date.group(1)) < 2021:
            continue
        for path in sorted(directory.rglob('*.docx')):
            doc = Document(path)
            rows = [(p.text, bool(p._p.xpath('.//w:drawing | .//w:pict'))) for p in doc.paragraphs]
            # One 2021 document contains three consecutive papers.
            starts = [i for i, (t, _) in enumerate(rows) if re.search(r'2021年12月大学英语六级考试真题（第[123]套）', t)]
            sections = [(i, rows[start:starts[i+1] if i+1 < len(starts) else len(rows)]) for i, start in enumerate(starts)] if starts else [(None, rows)]
            for index, section in sections:
                paper_number = str(index + 1) if index is not None else None
                if paper_number is None:
                    m = re.search(r'第([123一二三])套', path.name)
                    if not m:
                        continue
                    paper_number = {'一':'1', '二':'2', '三':'3'}.get(m.group(1), m.group(1))
                paper_id = date.group(1) + date.group(2) + '-' + paper_number
                essay, trans = extract_writing_sections(section)
                for kind, prompt in [('essay', essay), ('trans', trans)]:
                    key = (paper_id, kind)
                    if not prompt or key in seen:
                        continue
                    seen.add(key)
                    items.append({'id': 'personal-cet6-' + paper_id + '-' + kind, 'type': kind,
                                  'title': f'{date.group(1)}年{int(date.group(2))}月六级第{paper_number}套 · ' + ('作文' if kind == 'essay' else '翻译'),
                                  'sub': '本机真题', 'minutes': 30, 'prompt': prompt,
                                  'require': '根据题目要求写作。' if kind == 'essay' else '将上面的中文翻译成英文。',
                                  'sample': '', 'tips': [], 'source': path.relative_to(MATERIALS).as_posix()})
        # Later papers have searchable text layers but no accompanying Word file.
        if int(date.group(1)) >= 2024:
            import fitz
            for path in sorted(directory.rglob('*.pdf')):
                m = re.search(r'真题第([123])套', path.name)
                if not m:
                    continue
                paper_number = m.group(1)
                paper_id = date.group(1) + date.group(2) + '-' + paper_number
                with fitz.open(path) as doc:
                    first, last = doc[0].get_text(), doc[-1].get_text()
                essay_match = re.search(r'(Directions\s*[:：].*?)(?=Part\s*(?:II\b|Ⅱ|H\b)|Section\s+A\b|Listening\s+Comprehension)', first, re.I | re.S)
                essay = clean(essay_match.group(1)) if essay_match else None
                if essay and (len(essay) < 50 or len(essay) > 2000 or re.search(r'\b(?:graph|chart|table)\s+(?:below|above)\b', essay, re.I)):
                    essay = None
                trans_match = re.search(r'Answer\s+Sheet\s*2\s*\.\s*(.*)', last, re.I | re.S)
                trans = trans_match.group(1) if trans_match else ''
                trans = re.split(r'\n\s*(?:试题册|扫码看详解|六级轻松过|[•・]|\d{1,2}\s*(?=\n|$))', trans, maxsplit=1)[0]
                trans = re.sub(r'\s*\n\s*', '', trans).strip()
                # Local text-layer errors verified against the rendered PDF page.
                corrections = {'202412-1': [('色d ：(Beidou)', '北斗(Beidou)')],
                               '202512-3': [('芭俭(frugality)', '节俭(frugality)')],
                               '202606-3': [('d ro n e', 'drone'), ('道清(high-deflmtion)', '高清(high-definition)')]}
                for wrong, correct in corrections.get(paper_id, []):
                    trans = trans.replace(wrong, correct)
                if len(re.findall(r'[\u4e00-\u9fff]', trans)) < 60:
                    trans = None
                for kind, prompt in [('essay', essay), ('trans', trans)]:
                    key = (paper_id, kind)
                    if not prompt or key in seen:
                        continue
                    seen.add(key)
                    items.append({'id': 'personal-cet6-' + paper_id + '-' + kind, 'type': kind,
                                  'title': f'{date.group(1)}年{int(date.group(2))}月六级第{paper_number}套 · ' + ('作文' if kind == 'essay' else '翻译'),
                                  'sub': '本机真题 · PDF 文本识别', 'minutes': 30, 'prompt': prompt,
                                  'require': '请核对原卷后根据题目要求写作。' if kind == 'essay' else '请核对原卷后将上面的中文翻译成英文。',
                                  'sample': '', 'tips': [], 'source': path.relative_to(MATERIALS).as_posix()})
    return items

def build():
    import fitz
    matches = list((MATERIALS / '六级真题' / '六级真题').glob('2021年12*/**/2021.12六级真题第1套.pdf'))
    if len(matches) != 1:
        raise ValueError('Cannot uniquely locate the reviewed source paper')
    paper = matches[0]
    doc = fitz.open(paper)
    pages = [doc[i].get_text() for i in (7, 8, 9, 10)]
    # The text layer corrupts the parenthetical Chinese; the English is intact.
    pages[1] = re.sub(r'non-GMO \( .*? \)', 'non-GMO', pages[1])
    body1 = clean(pages[0].split('following passage.', 1)[1])
    body2 = clean(pages[1].split('Questions 51 to 55 are based on the following passage.', 1)[1] + ' ' + pages[2].split('51.', 1)[0])
    q1 = parse_questions(pages[1].split('Passage Two', 1)[0], 46, 50, ANSWERS)
    q2 = parse_questions('51.' + pages[2].split('51.', 1)[1] + pages[3].split('Part IV', 1)[0], 51, 55, ANSWERS)
    sets = []
    for n, body, questions in [(1, body1, q1), (2, body2, q2)]:
        sets.append({'id': f'personal-cet6-202112-1-reading-{n}', 'type': 'reading',
                     'test': '2021年12月六级真题 · 第1套', 'no': n,
                     'title': f'仔细阅读 · Passage {n}', 'source': '本机星火六级资料',
                     'body': [body], 'paras': [], 'bank': [], 'questions': questions})
    paragraphs, questions = parse_matching('\n'.join(doc[i].get_text() for i in (4, 5, 6)))
    sets.insert(0, {'id': 'personal-cet6-202112-1-matching', 'type': 'match',
                    'test': '2021年12月六级真题 · 第1套', 'no': 0,
                    'title': '段落匹配 · 奢侈品库存', 'heading': 'No one in fashion is surprised that Burberry burnt £28 million of stock',
                    'source': '本机星火六级资料', 'body': [], 'paras': paragraphs, 'bank': [], 'questions': questions})
    cloze_text = doc[3].get_text().split('A) affect', 1)[0]
    found = re.findall(r'\b(?:2[6-9]|3[0-5])\b', cloze_text)
    if found != [str(n) for n in range(26, 36)]:
        raise ValueError('Cloze blanks missing or not in order')
    cloze_text = re.sub(r'\b(2[6-9]|3[0-5])\b', lambda m: '【' + m.group(1) + '】', cloze_text)
    words = 'affect beyond conceded correlation foster henceforth lofty noteworthy plausibly premature reconciled span specifically spiral trait'.split()
    sets.insert(0, {'id': 'personal-cet6-202112-1-cloze', 'type': 'cloze',
                    'test': '2021年12月六级真题 · 第1套', 'no': 0,
                    'title': '选词填空 · 乐观与长寿', 'source': '本机星火六级资料',
                    'body': [clean(cloze_text)], 'paras': [],
                    'bank': [{'k': chr(65+i), 'w': word} for i, word in enumerate(words)],
                    'questions': [{'n': 26+i, 'stem': f'第 {26+i} 空', 'options': [], 'answer': a, 'key': word, 'explain': explanation}
                                  for i, (a, word, explanation) in enumerate(CLOZE)]})
    from docx import Document
    directory = next((MATERIALS / '六级真题' / '六级真题').glob('2021年12*'))
    document = next(directory.rglob('2021年12月六级真题全3套.docx'))
    recording = next(directory.rglob('2021.12六级听力第1套.mp3'))
    questions = parse_listening([p.text for p in Document(document).paragraphs], LISTENING_KEY)
    sets.insert(0, {'id': 'personal-cet6-202112-1-listening', 'type': 'listening',
                    'test': '2021年12月六级真题 · 第1套', 'no': 0, 'title': '听力真题 · 第1套',
                    'source': '本机星火六级资料', 'audio': recording.relative_to(MATERIALS).as_posix(),
                    'body': [], 'paras': [], 'bank': [], 'questions': questions})
    # 2022.06 第 1 套：46–55 题答案核对自配套解析册。
    for paper_number, marker, keys in [(1, '第一套', ('BACDB', 'ADACD')), (2, '第二套', ('BAADB', 'BCDCD'))]:
        document_202206 = next((MATERIALS / '六级真题' / '六级真题').glob('2022年06*/**/*' + marker + '.docx'))
        reading_rows = [p.text for p in Document(document_202206).paragraphs]
        for number, first, key in [(1, 46, keys[0]), (2, 51, keys[1])]:
            body, questions = parse_docx_reading(reading_rows, first, key)
            sets.append({'id': f'personal-cet6-202206-{paper_number}-reading-{number}', 'type': 'reading',
                         'test': f'2022年6月六级真题 · 第{paper_number}套', 'no': number,
                         'title': f'仔细阅读 · Passage {number}', 'source': '本机星火六级资料',
                         'body': [body], 'paras': [], 'bank': [], 'questions': questions})
    # 答案根据 2025.12 三套解析册的相应页面逐题核对。
    for paper_number, keys, cloze_key, match_key in [
            (1, ('DADBB', 'CACDB'), 'HJGCEFDKLA', 'CHDLAFMJOG'),
            (2, ('ABCBC', 'DBDAC'), 'IBMCKADFJO', 'FKJEMIOCNH'),
            (3, ('BBACC', 'DCBAD'), 'NGFJHMECDB', 'QIAJRLFKBN')]:
        pdf_202512 = next((MATERIALS / '六级真题' / '六级真题').glob(f'2025年12*/**/2025.12六级真题第{paper_number}套*.pdf'))
        with fitz.open(pdf_202512) as latest:
            reading_rows = []
            audio_pages = []
            for page in latest:
                page_lines = []
                for block in page.get_text('dict')['blocks']:
                    for line in block.get('lines', []):
                        value = ''.join(span['text'] for span in line['spans']).strip()
                        if value:
                            page_lines.append((line['bbox'][0], line['bbox'][1], value))
                audio_pages.append(page_lines)
                for line in page.get_text().splitlines():
                    if (re.fullmatch(r'\s*\d{1,2}\s*', line) and int(line.strip()) not in range(26, 36)) or re.match(r'^\s*[•・■]\s*2025年12月六级真题', line):
                        continue
                    reading_rows.append(line)
        if paper_number in (1, 2):
            audio_key = {1: 'ADCABBDCDACABBDBADCBDCACD', 2: 'BACDABDCBCACABDCBDDACCADB'}[paper_number]
            audio = next((MATERIALS / '六级真题' / '六级真题').glob(f'2025年12*/**/2025.12六级听力第{paper_number}套.mp3'))
            listen_questions = parse_pdf_listening(audio_pages[:3], audio_key)
            sets.append({'id': f'personal-cet6-202512-{paper_number}-listening', 'type': 'listening',
                         'test': f'2025年12月六级真题 · 第{paper_number}套', 'no': 0,
                         'title': f'听力真题 · 第{paper_number}套', 'source': '本机星火六级资料 · PDF 文本识别，建议对照原卷',
                         'audio': audio.relative_to(MATERIALS).as_posix(), 'body': [], 'paras': [], 'bank': [], 'questions': listen_questions})
        exam_text = '\n'.join(reading_rows)
        body, bank, cloze_questions = parse_exam_cloze(exam_text, cloze_key)
        sets.append({'id': f'personal-cet6-202512-{paper_number}-cloze', 'type': 'cloze',
                     'test': f'2025年12月六级真题 · 第{paper_number}套', 'no': 0,
                     'title': '选词填空', 'source': '本机星火六级资料 · PDF 文本识别，建议对照原卷',
                     'body': [body], 'paras': [], 'bank': bank, 'questions': cloze_questions})
        paragraphs, match_questions = parse_exam_match(exam_text, match_key)
        sets.append({'id': f'personal-cet6-202512-{paper_number}-match', 'type': 'match',
                     'test': f'2025年12月六级真题 · 第{paper_number}套', 'no': 0,
                     'title': '段落匹配', 'source': '本机星火六级资料 · PDF 文本识别，建议对照原卷',
                     'body': [], 'paras': paragraphs, 'bank': [], 'questions': match_questions})
        # PDF text order interleaves the right-hand column of Q49 after Q50.
        if paper_number == 2:
            displaced = ['C) A hindrance to social advancement.', 'D) An inevitable end to liberal pursuits.']
            for line in displaced:
                reading_rows.remove(line)
            insertion = next(i for i, line in enumerate(reading_rows) if line.startswith('50. What do social theorists'))
            reading_rows[insertion:insertion] = displaced
        for number, first, key in [(1, 46, keys[0]), (2, 51, keys[1])]:
            body, questions = parse_docx_reading(reading_rows, first, key)
            # These recurring font-map errors are checked against the PDF page images.
            for wrong, correct in [('^^', '”'), ('Thafs', "That's"), ('Ifs', "It's"), ('You5re', "You're"),
                                   (' fbr ', ' for '), ('befbre', 'before'), ('lefs', "let's"),
                                   ('Lefs', "Let's"), ('said, UI believe', 'said, “I believe'), ('reality.,5', 'reality.”')]:
                body = body.replace(wrong, correct)
            for question in questions:
                question['stem'] = question['stem'].replace('""attention economy55', '“attention economy”')
                for option in question['options']:
                    option['t'] = option['t'].replace('fbcus', 'focus').replace(' fbr ', ' for ')
            sets.append({'id': f'personal-cet6-202512-{paper_number}-reading-{number}', 'type': 'reading',
                         'test': f'2025年12月六级真题 · 第{paper_number}套', 'no': number,
                         'title': f'仔细阅读 · Passage {number}', 'source': '本机星火六级资料 · PDF 文本识别，建议对照原卷',
                         'body': [body], 'paras': [], 'bank': [], 'questions': questions})
    writing = collect_subjective()
    payload = {'version': 1, 'source': str(paper.relative_to(MATERIALS)), 'sets': sets, 'writing': writing}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Generated {len(sets)} sets / {sum(len(s["questions"]) for s in sets)} questions / {len(writing)} writing prompts: {OUTPUT}')

if __name__ == '__main__':
    build()
