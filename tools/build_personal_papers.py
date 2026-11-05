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
    payload = {'version': 1, 'source': str(paper.relative_to(MATERIALS)), 'sets': sets}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Generated {len(sets)} passages / {sum(len(s["questions"]) for s in sets)} questions: {OUTPUT}')

if __name__ == '__main__':
    build()
