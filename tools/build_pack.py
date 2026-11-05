# -*- coding: utf-8 -*-
"""把「四六级真题+资料包」里可解析的真题 PDF 抽成网页数据。

为什么这么写：
  · 各年份 PDF 排版差别很大（有的 `A. word`，有的 `A.word`；段落有的 `A. ` 有的 `[A] `；
    有的连 Section 标题都没有）。唯一稳定的是 ETS 的 Directions 措辞，
    所以切段一律靠 Directions 锚点，不靠 Part/Section 标题。
  · 答案绝不猜：只认两种可核验来源
      ① 答案速查（字母一块一块排的表格，还能顺带拿到范文与参考译文）
      ② 星火解析（`36. 【定位】… E）【精析】`，答案就是【精析】前那个字母）
    抽完做严格校验（词库 15 个、空 10 个、段落 A~O、题干 36~45、阅读 2×5 四选一、
    每题答案都在合法字母集内），不合格的整套丢掉，不半成品上线。

用法：
  python tools/build_pack.py --scan      # 只体检，打印每套的校验结果
  python tools/build_pack.py --emit      # 体检通过后生成 data/*.js
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

import fitz

ROOT = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite\四六级真题+资料包\四六级真题\2014-2025年六级真题")
CACHE = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite\tools\.cache\pack")
CACHE.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- 文本清洗

NOISE = [
    re.compile(r"https?://\S+"),
    re.compile(r"(?m)^\s*[-—]?\s*\d{1,3}\s*[-—]?\s*$"),            # 页码
    re.compile(r"(?m)^.*大学英语六级考试真题（[一二三1-3]）\s*$"),   # 页眉
    re.compile(r"(?m)^.*英语六级真题\(第[一二三]套\)\s*$"),
    re.compile(r"(?m)^\s*六级\s*202[0-9]\.[0-9]{1,2}\s*[，,]?\s*第?[一二三1-3]?\s*套?\s*[\]］]?\s*$"),
    re.compile(r"(?m)^\s*[·•]\s*20\d{2}年\d{1,2}月六级真题.*$"),
]


def clean(t: str) -> str:
    for p in NOISE:
        t = p.sub("", t)
    t = t.replace("\u3000", " ").replace("\xa0", " ").replace("\u2019", "'")
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"\n{2,}", "\n", t)
    return t.strip()


def pdf_text(path: pathlib.Path) -> str:
    d = fitz.open(str(path))
    t = "\n".join(p.get_text() for p in d)
    d.close()
    return clean(t)


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- 切段

ANCHORS = [
    ("listen", "you will hear two long conversations"),
    ("cloze", "passage with ten blanks"),
    ("match", "ten statements attached"),
    ("read", "passages in this section"),
    ("trans", "translate a passage"),
]


PART_FALLBACK = {
    "listen": (r"Part\s*[\u2161II]+\s*[^\n]*Listening", r"Part\s*[\u2162III]+\s*[^\n]*Read"),
    "cloze": (r"Part\s*[\u2162III]+\s*[^\n]*Read", r"Section\s*B\b"),
    "match": (r"Section\s*B\b", r"Section\s*C\b"),
    "read": (r"Section\s*C\b", r"Part\s*[\u2163IV]+\s*[^\n]*Trans"),
    "trans": (r"Part\s*[\u2163IV]+\s*[^\n]*Trans", r"\Z"),
}


def sections(t: str) -> dict:
    """优先按 Directions 锚点切；早年卷子没有 Directions（2019年12月那种），
    退回 Part / Section 标题切。两条都失败就给空串，后续解析自然跳过。"""
    low = t.lower()
    pos = {}
    for k, a in ANCHORS:
        pos[k] = low.find(a)
    if pos["cloze"] < 0 or pos["match"] < 0:
        for k, (a, b) in PART_FALLBACK.items():
            if pos.get(k, -1) >= 0:
                continue
            ma = re.search(a, t, re.I)
            if not ma:
                continue
            mb = re.search(b, t[ma.end():], re.I)
            pos[k] = ma.end()
            if mb:
                pos.setdefault("_end_" + k, ma.end() + mb.start())
    out = {}
    out["writing"] = t[: pos["listen"]] if pos.get("listen", -1) > 0 else t[:1200]
    order = [k for k, _ in ANCHORS]
    for i, k in enumerate(order):
        start = pos.get(k, -1)
        end = pos.get("_end_" + k, len(t))
        for k2 in order[i + 1:]:
            j = pos.get(k2, -1)
            if j > start >= 0:
                end = min(end, j)
                break
        out[k] = t[start:end] if start >= 0 else ""
    return out


def after_directions(region: str, tail: str) -> str:
    """把 Directions 那段（以 tail 结尾）切掉，返回正文。"""
    i = region.find(tail)
    return region[i + len(tail):] if i >= 0 else region


# ---------------------------------------------------------------- 写作

def parse_writing(region: str) -> dict:
    body = squash(region)
    m = re.search(r"begins with the sentence\s*[\u201c\u201d\"'](.{20,300}?)[\u201c\u201d\"']", body)
    quote = m.group(1).strip() if m else ""
    if not quote:
        m = re.search(r"[\u201c]([^\u201d]{20,300})[\u201d]", body)
        quote = m.group(1).strip() if m else ""
    w = re.search(r"at least\s*(\d+)\s*words?\s*but\s*no\s*more\s*than\s*(\d+)", body, re.I)
    return {
        "quote": quote,
        "minWords": int(w.group(1)) if w else 150,
        "maxWords": int(w.group(2)) if w else 200,
        "directions": body[:500],
    }


# ---------------------------------------------------------------- 选词填空

BANK_LINE = re.compile(r"(?m)^[ \t]*([A-O])[\.\)]\s*([a-z][A-Za-z\-']*)[ \t]*$")


def parse_cloze(region: str) -> dict | None:
    # 词库可能按「列」排（A F K / B G L / …），所以不能要求顺序，只要求 15 个字母各一个
    cands = [(m.group(1), m.group(2), m.start(), m.end()) for m in BANK_LINE.finditer(region)]
    bank, bank_at = None, 0
    for i in range(len(cands) - 14):
        win = cands[i:i + 15]
        if sorted(c[0] for c in win) == [chr(ord("A") + k) for k in range(15)]:
            if len({c[1] for c in win}) == 15:
                bank = [{"k": c[0], "w": c[1]} for c in sorted(win, key=lambda x: x[0])]
                bank_at = win[0][2]
                break
    if not bank:
        return None
    passage = after_directions(region[:bank_at], "more than once.")
    passage = squash(passage)
    passage = re.sub(r"Part\s*III.*?minutes\)\s*", "", passage)
    passage = re.sub(r"(?<![0-9A-Za-z])(2[6-9]|3[0-5])(?![0-9])",
                     lambda m: "【%s】" % m.group(1), passage)
    blanks = re.findall(r"【(\d+)】", passage)
    return {"body": paras_of(passage), "bank": bank, "blanks": blanks}


def paras_of(text: str) -> list:
    """把一整段按句号后的大写字母切成自然段（PDF 没有段标记时的兜底）。"""
    text = squash(text)
    return [text] if text else []


# ---------------------------------------------------------------- 段落匹配

PARA_HEAD = re.compile(r"(?m)^[ \t]*(?:\[\s*([A-O])\s*\]|([A-O])[\.\)])\s*(?=[A-Za-z\u201c\u2018\"(])")
QHEAD = re.compile(r"(?m)^[ \t]*(3[6-9]|4[0-5])\.\s*")


def parse_match(region: str) -> dict | None:
    body = after_directions(region, "Answer Sheet 2.")
    body = body if body is not region else region
    # 段落：从 A 开始连续
    heads = []
    want = 0
    for m in PARA_HEAD.finditer(body):
        letter = m.group(1) or m.group(2)
        if letter == chr(ord("A") + want):
            heads.append((letter, m.start(), m.end()))
            want += 1
    if len(heads) < 10:
        return None
    title = squash(body[: heads[0][1]]).strip(" :：")
    title = re.sub(r"^Section\s*B\s*", "", title)
    paras = []
    for i, (k, _s, e) in enumerate(heads):
        end = heads[i + 1][1] if i + 1 < len(heads) else len(body)
        seg = body[e:end]
        cut = QHEAD.search(seg)
        if cut:
            seg = seg[: cut.start()]
        paras.append({"k": k, "text": squash(seg)})
    # 题干 36~45
    tail_start = heads[-1][1]
    tail = body[tail_start:]
    cut = QHEAD.search(tail)
    if cut:
        tail = tail[cut.start():]
    marks = [(m.start(), int(m.group(1))) for m in QHEAD.finditer(tail)]
    qs = []
    for i, (s, n) in enumerate(marks):
        e = marks[i + 1][0] if i + 1 < len(marks) else len(tail)
        seg = tall(tail[s:e], n)
        qs.append({"n": n, "stem": seg})
    return {"title": title, "paras": paras, "questions": qs}


def tall(seg: str, n: int) -> str:
    seg = re.sub(r"(?m)^[ \t]*%d\.\s*" % n, "", seg, count=1)
    return squash(seg)


# ---------------------------------------------------------------- 仔细阅读

PASSAGE_HEAD = re.compile(r"Passage\s+(One|Two|Three)\b", re.I)
RNUM = re.compile(r"(?m)^[ \t]*(4[6-9]|5[0-5])\.\s*")


def parse_readings(region: str) -> list:
    # 不能用 after_directions 切：第一篇的 Directions 里也有 "following passage."
    # 直接从 "Passage One" 起算，前面那堆说明自然被丢掉。
    body = region
    heads = list(PASSAGE_HEAD.finditer(body))
    out = []
    for i, m in enumerate(heads):
        seg = body[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)]
        marks = [(x.start(), int(x.group(1))) for x in RNUM.finditer(seg)]
        if len(marks) != 5:
            continue
        qs = []
        for j, (s, n) in enumerate(marks):
            e = marks[j + 1][0] if j + 1 < len(marks) else len(seg)
            block = seg[s:e]
            stem, opts = split_stem_options(block)
            qs.append({"n": n, "stem": stem, "options": opts})
        passage = squash(seg[: marks[0][0]])
        passage = re.sub(r"Questions?\s*\d+\s*to\s*\d+\s*are\s*based\s*on.*?passage\.\s*", "", passage,
                         flags=re.I)
        out.append({"label": m.group(1).title(), "body": para_split(passage), "questions": qs})
    return out


OPTMARK = re.compile(r"(?:^|(?<=[\s\n]))([A-D])[\.\)]\s*")


def split_stem_options(block: str) -> tuple:
    block = re.sub(r"(?m)^[ \t]*(4[6-9]|5[0-5])\.\s*", "", block, count=1)
    marks = [(m.start(), m.group(1)) for m in OPTMARK.finditer(block)]
    if len(marks) < 4:
        return squash(block), []
    stem = squash(block[: marks[0][0]])
    opts = []
    for i, (s, k) in enumerate(marks[:4]):
        e = marks[i + 1][0] if i + 1 < len(marks) else len(block)
        txt = squash(block[s:e])
        txt = re.sub(r"^[A-D][\.\)]\s*", "", txt)
        opts.append({"k": k, "t": txt})
    return stem, opts


def para_split(text: str) -> list:
    """阅读正文分段：中文版 PDF 里段与段之间通常没有空行，只能靠句号 + 大写开头切。
    宁可多切也不要把整篇压成一坨；切错了只影响观感。"""
    text = squash(text)
    if len(text) < 400:
        return [text] if text else []
    parts = re.split(r"(?<=[.!?\u201d])\s+(?=[A-Z\u201c])", text)
    out, cur = [], ""
    for s in parts:
        cur = (cur + " " + s).strip() if cur else s
        if len(cur) > 420:
            out.append(cur.strip())
            cur = ""
    if cur.strip():
        out.append(cur.strip())
    return out


# ---------------------------------------------------------------- 翻译 / 听力

def parse_translation(region: str) -> str:
    body = after_directions(region, "Answer Sheet 2.")
    body = re.sub(r"(?m)^[ \t]*Part\s*IV.*$", "", body)
    body = re.sub(r"(?m)^[ \t]*Translation\s*$", "", body)
    body = re.sub(r"[ \t]*[·•]\s*20\d{2}.*$", "", body, flags=re.S)
    return squash(body)


def parse_listening(region: str) -> list:
    """返回 [{n, options}]；听力在卷面上只印选项，题干要听。题干从解析里补。"""
    body = re.sub(r"Directions:\s.*?(?:centre\.|once\.)", " ", region, flags=re.S | re.I)
    body = re.sub(r"(?m)^[ \t]*Section\s*[ABC][ \t]*$", "", body, flags=re.I)
    marks = [(m.start(), int(m.group(1))) for m in re.finditer(r"(?m)^[ \t]*(\d{1,2})\.\s", body)]
    marks = [(s, n) for s, n in marks if 1 <= n <= 25]
    # 只保留递增序列
    seen, seq = 0, []
    for s, n in marks:
        if n == seen + 1:
            seq.append((s, n))
            seen = n
    out = []
    for i, (s, n) in enumerate(seq):
        e = seq[i + 1][0] if i + 1 < len(seq) else len(body)
        block = body[s:e]
        block = re.sub(r"(?m)^[ \t]*%d\.\s*" % n, "", block, count=1)
        block = re.sub(r"Questions?\s*\d+\s*to\s*\d+\s*are\s*based\s*on.*?heard\.", "", block,
                       flags=re.I | re.S)
        stem, opts = split_stem_options(block)
        out.append({"n": n, "stem": stem if len(stem) > 8 else "", "options": opts})
    return out

# ---------------------------------------------------------------- 答案

PART_LINE = re.compile(r"(?m)^[ \t]*Part\b[^\n]*$")
ONE_LETTER = re.compile(r"(?m)^[ \t]*([A-O])[ \t]*$")
ANCH = re.compile(r"(?m)^[ \t]*(\d{1,2})\.[ \t]*")
ANS_NEAR = re.compile(r"([A-O])[ \t]*[\)）]?[ \t]*[\[【t:]?[ \t]*(?:语法判断|精析|语义判断|答案|定位)")
EXP_MARK = re.compile(r"【(精析|语法判断|语义判断|定位|避错|考点|解析)】|［(考点|解析)］")


def letter_grid(path: pathlib.Path) -> str:
    """把「答案速查」里的字母**按坐标**读出来。

    🔴 这步必须用坐标：答案表是网格（实测 13 列/行 或 6 列/行），
    `get_text()` 的文本流顺序和视觉顺序不一致，按文本流读会把答案整体错位
    （第一版就是这么错的：26 题答案读成了第 8 个字母）。"""
    d = fitz.open(str(path))
    rows = []
    for pg in d:
        ws = [w for w in pg.get_text("words")
              if len(w[4].strip()) == 1 and w[4].strip() in "ABCDEFGHIJKLMNO"]
        rows.extend(ws)
    d.close()
    if not rows:
        return ""
    rows.sort(key=lambda w: (w[1], w[0]))
    out, cur, last_y = [], [], None
    for w in rows:
        if last_y is not None and abs(w[1] - last_y) > 8:
            out.append("".join(x[4] for x in sorted(cur, key=lambda x: x[0])))
            cur = []
        cur.append(w)
        last_y = w[1]
    if cur:
        out.append("".join(x[4] for x in sorted(cur, key=lambda x: x[0])))
    # 丢掉孤零零的单字母（页眉里的 "I"、装饰字母），真表格一行至少 4 个
    return "".join(r for r in out if len(r) >= 4)


def parse_key_table(text: str, grid: str = "") -> dict:
    """答案速查：听力 25 个字母 + 阅读 30 个字母。
    grid 是坐标还原出来的字母串（首选），text 只做兜底。"""
    # 🔴 只认坐标网格。不能退回「文本流里的单字母」：解析册里也散落着大量单字母行，
    # 凑够 55 个就会被误当成答案表（2022年12月星火解析就踩过）。
    src = grid
    ans = {}
    if len(src) >= 55:
        L, R = src[:25], src[25:55]
        if set(L) <= set("ABCD"):
            for i, k in enumerate(L):
                ans[i + 1] = k
            for i, k in enumerate(R):
                ans[26 + i] = k
    elif len(src) == 30:            # 只印阅读的速查（第3套这种）
        for i, k in enumerate(src):
            ans[26 + i] = k
    return ans


def parse_key_inline(text: str) -> dict:
    """另一种速查排布：`1.D  2.C …`（2019年12月那本）。
    比字母表更可靠 —— 题号直接绑着答案，不会因为网格顺序读错。"""
    ans = {}
    for m in re.finditer(r"(?<![\dA-Za-z])(\d{1,2})\s*[\.．]\s*([A-O])(?![A-Za-z])", text):
        n = int(m.group(1))
        if 1 <= n <= 55:
            ans.setdefault(n, m.group(2))
    return ans


def parse_explain(text: str) -> dict:
    """星火/其它解析册：`26. 【考点】… F)【语法判断】` 或 `46.【定位】… D)【精析】`。
    答案 = 标记词前面那个字母；OCR 把【打成 t/[/: 也照样能认。"""
    marks = [(m.start(), int(m.group(1))) for m in ANCH.finditer(text)]
    out = {}
    for i, (s, n) in enumerate(marks):
        if not 1 <= n <= 55 or n in out:
            continue
        e = marks[i + 1][0] if i + 1 < len(marks) else min(len(text), s + 1500)
        seg = text[s:e]
        if not re.search(r"考点|定位|精析|语法判断|解析|答案", seg[:400]):
            continue
        m = ANS_NEAR.search(seg)
        if not m:
            continue
        exp = seg[m.end():]
        exp = EXP_MARK.sub(" ", exp)
        out[n] = {"ans": m.group(1), "exp": squash(exp)[:420]}
    return out


def parse_key_sample(text: str) -> dict:
    """答案速查里的范文与参考译文（部分套只印了第一行，长度校验不过就丢）。"""
    out = {"sample": "", "sampleZh": ""}
    m = re.search(r"(?m)^[ \t]*参考范文[ \t]*[:：]?[ \t]*$", text)
    if m:
        seg = text[m.end():]
        stop = re.search(r"(?m)^[ \t]*Part\b", seg)
        out["sample"] = squash(seg[: stop.start()] if stop else seg)
    m = re.search(r"(?m)^[ \t]*参考译文[ \t]*[:：]?[ \t]*$", text)
    if m:
        out["sampleZh"] = squash(text[m.end():])
    return out


# ---------------------------------------------------------------- 配对 / 切套

SETNO_PAT = [
    (re.compile(r"第\s*([123一二三])\s*套"), None),
    (re.compile(r"[（(]\s*([123一二三])\s*[）)]"), None),
    (re.compile(r"卷\s*([123一二三])"), None),
]
CN2N = {"一": 1, "二": 2, "三": 3, "1": 1, "2": 2, "3": 3}


def set_no(name: str) -> int:
    for pat, _ in SETNO_PAT:
        m = pat.search(name)
        if m:
            return CN2N[m.group(1)]
    return 1


ANS_NAME = re.compile(r"答案速查|答案|解析|详解")


def find_answer(paper: pathlib.Path):
    """只在**同一个年月文件夹**里找答案文件（跨年配错会把答案张冠李戴，比没题更糟）。
    套号不做硬过滤 —— 实测编号会错位，改由内容指纹（load_answers）决定用哪份。"""
    dirs = [paper.parent]
    if re.match(r"^\d{2}[、.]", paper.parent.name):
        dirs.append(paper.parent.parent)
    seen, cands = set(), []
    for d in dirs:
        if d in seen:
            continue
        seen.add(d)
        for f in d.glob("*.pdf"):
            if f == paper or f.stat().st_size < 1000:
                continue
            if not ANS_NAME.search(f.name):
                continue
            if "四级" in f.name and "六级" not in f.name:
                continue
            score = 0
            if "速查" in f.name:
                score += 2
            if "解析" in f.name or "详解" in f.name:
                score += 1
            if set_no(f.name) == set_no(paper.name):
                score += 1
            cands.append((-score, len(f.name), f))
    cands.sort()
    return [c[2] for c in cands]


def split_multi(text: str, n: int) -> str:
    """一份解析册里塞了三套？按「真题（一）」这类标题切开取第 n 套。"""
    heads = [(m.start(), CN2N.get(m.group(1), 0)) for m in
             re.finditer(r"(?:真题|试题)\s*[（(]\s*([123一二三])\s*[）)]", text)]
    idx = [i for i, h in enumerate(heads) if h[1] == n]
    if len(heads) >= 2 and idx:
        i = idx[0]
        s = heads[i][0]
        e = heads[i + 1][0] if i + 1 < len(heads) else len(text)
        return text[s:e]
    return text


STOPW = set("""the a an and or but to of in on for with by at from that this these those is are was were be been
being will would can could should may might must have has had do does did not no nor as if than then so such
we our us you your they their it its he she his her them i my me more most very much many some any all each
both few other another same different into onto about over under between among during before after while
""".split())


def fp(text: str, n: int = 500) -> set:
    """内容指纹：取一段文字里长度 ≥4 的实词。"""
    ws = re.findall(r"[A-Za-z][A-Za-z'\-]{3,}", text[:n].lower())
    return {w for w in ws if w not in STOPW}


def overlap(a: set, b: set) -> float:
    if not a:
        return 0.0
    return len(a & b) / float(len(a))


def answer_segments(text: str) -> list:
    """解析册里可能塞了三套：按「真题（一/二/三）」切开；切不开就整份当一套。"""
    heads = [(m.start(), CN2N.get(m.group(1), 0)) for m in
             re.finditer(r"(?:真题|试题)\s*[（(]\s*([123一二三])\s*[）)]", text)]
    if len(heads) < 2:
        return [text]
    out = []
    for i, (s, _n) in enumerate(heads):
        e = heads[i + 1][0] if i + 1 < len(heads) else len(text)
        out.append(text[s:e])
    return out


# 编号错位时人工核对后写死：真题文件名 → 答案文件名
# 2024年6月：速查册的「范文页」和「字母表页」被拼串了（范文属 A 套、答案属 B 套），
# 所以写作指纹不可信。这里的三条是**逐题按语义核对**后确定的
# （例：真题1 完形讲彩虹，26 空 needs "dispersion"，对应速查3 的第 3 个字母 C）。
ANSRC_OVERRIDE = {
    "2024年6月英语六级真题(第1套).pdf": "2024年06月六级考试真题答案速查（第3套）.pdf",
    "2024年6月英语六级真题(第2套).pdf": "2024年06月六级考试真题答案速查（第1套）.pdf",
    "2024年6月英语六级真题(第3套).pdf": "2024年06月六级考试真题答案速查（第2套）.pdf",
}


def shingles(t: str, n: int = 8) -> set:
    ws = re.findall(r"[a-z]+", t.lower())
    return {tuple(ws[i:i + n]) for i in range(len(ws) - n + 1)}


def quote_score(paper_text: str, ans_text: str) -> int:
    """解析册会整句引用原文（【定位】），所以「引用命中数」能证明这份解析属于这套题。
    答案速查只有字母和范文，命中数天然为 0 —— 这种只能靠人工核对过的 ANSRC_OVERRIDE。"""
    a = shingles(paper_text)
    b = shingles(ans_text)
    if not b:
        return 0
    return len(a & b)


def load_answers(paper: pathlib.Path, paper_text: str) -> tuple[dict, dict, str, dict]:
    """返回 (answers, keySample, 说明, 逐题解析)。"""
    files = find_answer(paper)
    ov = ANSRC_OVERRIDE.get(paper.name)
    if ov:
        files = [f for f in files if f.name == ov] or files
    best = None
    for f in files:
        try:
            if ov and f.name != ov:
                continue
            t = pdf_text(f)
            grid = letter_grid(f)
        except Exception:
            continue
        if len(t) < 100:
            continue
        qs = quote_score(paper_text, t)
        for seg in answer_segments(t):
            # 三种答案格式，可靠性从高到低：题号直绑字母 > 坐标网格 > 解析册
            a = parse_key_inline(seg)
            kind = "速查·题号直绑"
            if len(a) < 40:
                a = parse_key_table(seg, grid)
                kind = "速查·字母表"
            if len(a) < 25:
                a = parse_explain(seg)
                kind = "解析"
                if len(a) < 18:
                    continue
                cand = (qs, a, {}, f.name, kind)
            else:
                cand = (qs, a, parse_key_sample(seg), f.name, kind)
            if best is None or cand[0] > best[0]:
                best = cand
    if not best:
        return {}, {}, "", {}
    score, a, sample, fname, kind = best
    # 速查的「题号直绑字母」自带校验（每个答案都绑死在题号上），不需要引用命中；
    # 只要求套号一致，防止拿别的套的答案。解析册则必须过引用命中这一关。
    keyed = kind.startswith("速查") and set_no(fname) == set_no(paper.name)
    if not ov and score < 6 and not keyed:
        return {}, {}, "解析引用对不上（%d 处），丢弃" % score, {}
    tag = "人工核对映射" if ov else ("速查套号一致" if keyed else "引用命中 %d 处" % score)
    letters = {n: (v.get("ans") if isinstance(v, dict) else v) for n, v in a.items()}
    return a, sample, "%s · %s（%s）" % (tag, fname, kind), load_explain(paper, letters)


def load_explain(paper: pathlib.Path, letters: dict) -> dict:
    """把解析册里逐题的【定位】/【精析】也带上（速查只给字母，没有解析）。

    安全性靠一条硬约束：**解析里给出的答案字母必须和我们这套采用的答案一致**
    才收。文件夹里往往同时躺着好几套的解析，字母对不上就说明不是这套的，
    宁可这题没有解析，也不把别的套的解析贴过来。"""
    out = {}
    for f in find_answer(paper):
        try:
            t = pdf_text(f)
        except Exception:
            continue
        if not re.search(r"精析|语法判断|定位", t):
            continue
        for seg in answer_segments(t):
            for n, d in parse_explain(seg).items():
                if n in out or n not in letters:
                    continue
                if d["ans"] != letters[n]:
                    continue
                exp = (d.get("exp") or "").strip()
                # 切完标记词常剩一个孤零零的「】」或「)」，去掉再入库
                exp = re.sub(r"^[】\]\)）】:：、,，.。\s]+", "", exp)
                if len(exp) >= 24:
                    out[n] = exp
    return out


# ---------------------------------------------------------------- 生成题目集

TEST_NAME = re.compile(r"(20\d{2})年(\d{1,2})月")


def test_info(paper: pathlib.Path) -> tuple:
    """(标签, id 前缀, 套号)。年份月份优先取文件名，取不到就看所在目录名。"""
    m = TEST_NAME.search(paper.name) or TEST_NAME.search(str(paper.parent))
    if not m:
        return paper.stem, "ztx", set_no(paper.name)
    yy = m.group(1)[2:]
    mm = m.group(2).zfill(2)
    no = set_no(paper.name)
    return "%s年%s月真题（第%d套）" % (m.group(1), int(m.group(2)), no), "zt%s%s" % (yy, mm), no


def build_sets(paper: pathlib.Path) -> list:
    t = pdf_text(paper)
    if "ten blanks" not in t.lower():
        return []
    sec = sections(t)
    wr = parse_writing(sec["writing"])
    answers, keySample, note, exps = load_answers(paper, t)
    if len(answers) < 18:
        return []
    label, tag, no = test_info(paper)
    base = "%s-%d" % (tag, no)
    src = "四六级真题 PDF · %s" % paper.name
    if keySample.get("sample"):
        src += "（范文取自 %s）" % note.split("·")[-1].strip()
    out = []

    # ---- 选词填空
    c = parse_cloze(sec["cloze"])
    if c and len(c["bank"]) == 15:
        bankK = {b["k"]: b["w"] for b in c["bank"]}
        qs = []
        for n in range(26, 36):
            a = answers.get(n, {}).get("ans") if isinstance(answers.get(n), dict) else answers.get(n)
            if not a or a not in bankK:
                continue
            qs.append({"n": n, "stem": "第 %d 空" % (n - 25), "options": [],
                       "answer": a, "key": bankK[a], "explain": exps.get(n, "")})
        if len(qs) >= 9:
            out.append({
                "id": base + "-cloze", "test": label, "no": 3, "type": "cloze",
                "source": src, "topic": "选词填空", "minutes": 10,
                "title": "选词填空（第 26–35 题）", "heading": "",
                "body": c["body"], "bank": [{"k": b["k"], "w": b["w"]} for b in c["bank"]],
                "questions": qs,
            })

    # ---- 段落匹配
    m = parse_match(sec["match"])
    if m and len(m["paras"]) >= 12:
        legal = {p["k"] for p in m["paras"]}
        qs = []
        for q in m["questions"]:
            a = answers.get(q["n"], {}).get("ans") if isinstance(answers.get(q["n"]), dict) else answers.get(q["n"])
            if not a or a not in legal:
                continue
            qs.append({"n": q["n"], "stem": q["stem"], "options": [], "answer": a,
                       "explain": exps.get(q["n"], "")})
        if len(qs) >= 9:
            out.append({
                "id": base + "-match", "test": label, "no": 2, "type": "match",
                "source": src, "topic": "段落匹配", "minutes": 12,
                "title": m["title"] or "段落匹配（第 36–45 题）",
                "heading": m["title"],
                "body": [], "paras": m["paras"], "bank": [], "questions": qs,
            })

    # ---- 仔细阅读（两篇各自成一套）
    for i, r in enumerate(parse_readings(sec["read"])):
        qs = []
        for q in r["questions"]:
            a = answers.get(q["n"], {}).get("ans") if isinstance(answers.get(q["n"]), dict) else answers.get(q["n"])
            if not a or a not in "ABCD" or len(q["options"]) != 4:
                continue
            qs.append({"n": q["n"], "stem": q["stem"], "options": q["options"],
                       "answer": a, "explain": exps.get(q["n"], "")})
        if len(qs) == 5:
            out.append({
                "id": base + "-p%d" % (i + 1), "test": label, "no": 1, "type": "reading",
                "source": src, "topic": "仔细阅读", "minutes": 9,
                "title": "%s · 仔细阅读 Passage %s" % (label, r["label"]),
                "heading": "",
                "body": r["body"], "bank": [], "questions": qs,
            })
    return out


WDIR = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite")


def paper_files() -> list:
    out = []
    for f in ROOT.rglob("*.pdf"):
        n = f.name
        if ANS_NAME.search(n) and "真题" not in n:
            continue
        if any(k in n for k in ("解析", "答案", "详解")):
            continue
        out.append(f)
    return sorted(out)


# ---------------------------------------------------------------- 作文 / 翻译 / 听力

def clean_sample(s: str) -> str:
    s = re.sub(r"【\d+】", " ", s or "")
    s = re.sub(r"范文点评|精彩点评|参考范文|参考译文", " ", s)
    return squash(s)


def looks_done(s: str, minlen: int) -> bool:
    return bool(s) and len(s) >= minlen and s[-1] in ".!?\u201d\"'"


def load_writing_sample(paper: pathlib.Path, quote: str) -> dict:
    """范文/译文要单独找：速查册里「范文页」和「答案页」可能不是同一套（实测串页），
    所以范文按**写作题目指纹**匹配，答案按 ANSRC_OVERRIDE / 引用命中匹配。"""
    q = fp(quote, 300)
    for f in find_answer(paper):
        try:
            t = pdf_text(f)
        except Exception:
            continue
        if len(t) < 100:
            continue
        for seg in answer_segments(t):
            if q and overlap(q, fp(seg, 1500)) < 0.5:
                continue
            k = parse_key_sample(seg)
            return {"sample": clean_sample(k["sample"]), "sampleZh": clean_sample(k["sampleZh"])}
    return {"sample": "", "sampleZh": ""}


def build_writing(paper: pathlib.Path) -> dict | None:
    t = pdf_text(paper)
    wr = parse_writing(sections(t)["writing"])
    quote = wr["quote"]
    if len(quote) < 15 or cjk_ratio(quote) > 0.1:
        return None
    label, tag, no = test_info(paper)
    sm = load_writing_sample(paper, quote)
    sample = sm["sample"] if looks_done(sm["sample"], 400) else ""
    # 范文质量闸门：太短（缺页）、太长（并排三套）、字母占比低（OCR 烂）一律不要
    if sample and not (400 <= len(sample) <= 2600
                       and sum(1 for c in sample if ord(c) < 128) / float(len(sample)) >= 0.9):
        sample = ""
    return {
        "id": "wr-%s-%d" % (tag, no),
        "type": "essay",
        "title": "%s · 命题作文" % label,
        "sub": "真题 · 引语式议论文",
        "minutes": 30,
        "prompt": quote,
        "require": ("Write an essay of %d-%d words that begins with the sentence given above. "
                    "Make comments, cite examples or use your personal experience to develop it."
                    % (wr["minWords"], wr["maxWords"])),
        "sample": sample,
        "tips": [],
        "source": "四六级真题 PDF · %s" % paper.name,
    }


def cjk_ratio(s: str) -> float:
    if not s:
        return 0.0
    n = sum(1 for c in s if "\u4e00" <= c <= "\u9fff")
    return n / float(len(s))


def clean_trans_prompt(region: str) -> str:
    """卷尾翻译题的正文：Directions 之后、到页脚之前的那段中文。
    早年 PDF 里 Directions 与正文可能粘在一起，所以「最后一个 Answer Sheet 2.」之后才算正文。"""
    t = region
    i = t.rfind("Answer Sheet 2")
    if i >= 0:
        j = t.find(".", i)
        t = t[j + 1:] if j > 0 else t[i + len("Answer Sheet 2"):]
    t = re.sub(r"(?m)^[ \t]*Part\s*IV[^\n]*$", " ", t)
    t = re.sub(r"(?m)^[ \t]*Translation[^\n]*$", " ", t)
    t = re.sub(r"(?m)^[ \t]*\(30 minutes\)[^\n]*$", " ", t)
    t = re.sub(r"(?m)^[ \t]*Directions:[^\n]*$", " ", t)
    t = re.sub(r"[·•]\s*20\d{2}[^\n]*$", " ", t, flags=re.S)
    return squash(t)


def build_translation(paper: pathlib.Path) -> dict | None:
    t = pdf_text(paper)
    zh = clean_trans_prompt(parse_translation(sections(t)["trans"]))
    # 只收「真中文」：OCR 烂掉的段落里拉丁字母/符号会占一大半，这种一律不要
    if len(zh) < 80 or cjk_ratio(zh) < 0.55:
        return None
    label, tag, no = test_info(paper)
    # 🔴 参考译文一律不给：资料包的速查册里「范文页 / 答案页 / 译文页」分属不同套
    # （实测 2024年6月：同一份速查里 范文=第3套、答案=第2套、译文=第1套），
    # 中文段落与英文译文之间没有可靠的自动配对手段，宁可不给参考，也不能给错的那一份。
    sample = ""
    return {
        "id": "tr-%s-%d" % (tag, no),
        "type": "trans",
        "title": "%s · 汉译英" % label,
        "sub": "真题 · 段落翻译",
        "minutes": 30,
        "prompt": zh,
        "require": "Translate the passage into English.",
        "sample": sample,
        "tips": [],
        "source": "四六级真题 PDF · %s" % paper.name,
    }


AUDIO_DIR = WDIR / "audio"


def find_audio(paper: pathlib.Path):
    """同目录找 mp3，按套号配对；找不到返回 None。"""
    n = set_no(paper.name)
    out = []
    for d in {paper.parent, paper.parent.parent}:
        for f in list(d.glob("*.mp3")) + list(d.glob("*.MP3")):
            if set_no(f.name) == n:
                out.append(f)
    out.sort(key=lambda f: len(f.name))
    return out[0] if out else None


def build_listening(paper: pathlib.Path, answers: dict):
    t = pdf_text(paper)
    qs = parse_listening(sections(t)["listen"])
    if len(qs) != 25 or sum(1 for q in qs if len(q["options"]) == 4) < 25:
        return None
    out_q = []
    for q in qs:
        a = answers.get(q["n"])
        a = a["ans"] if isinstance(a, dict) else a
        if not a or a not in "ABCD":
            continue                      # 这一题没拿到官方答案就略去，绝不编
        out_q.append({"n": q["n"], "stem": q["stem"], "options": q["options"], "answer": a})
    if len(out_q) < 22:
        return None
    label, tag, no = test_info(paper)
    audio = find_audio(paper)
    if not audio:
        return None            # 没有录音、卷面又只有选项 —— 这种「听力」练不了，不出
    seg = {"id": "s1", "label": "听力录音（整套）", "transcript": [], "translation": "",
           "questions": out_q}
    if audio:
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        name = "cet6-%s-%d.mp3" % (tag.replace("zt", ""), no)
        seg["file"] = "audio/" + name
        seg["_src"] = str(audio)
        seg["_dst"] = str(AUDIO_DIR / name)
    return {
        "id": "ls-%s-%d" % (tag, no),
        "title": "%s · 听力" % label,
        "kind": "exam", "kindName": "真题听力",
        "topic": "长对话 · 篇章 · 讲话", "source": "四六级真题 PDF · %s" % paper.name,
        "minutes": 30,
        "intro": "%d 题。卷面只印选项 —— 和考场一样，问题要听。%s"
                 % (len(out_q), "" if len(out_q) == 25 else
                    "（原卷 25 题，其中 %d 题本站没能拿到官方答案，已略去）" % (25 - len(out_q))),
        "segments": [seg],
    }


def _recent(title: str, since: int = 2020) -> bool:
    m = re.search(r"(20\d{2})年", title or "")
    return bool(m) and int(m.group(1)) >= since


def main():
    sets, writings, listens, rows = [], [], [], []
    for f in paper_files():
        row = [f.name]
        try:
            got = build_sets(f)
            row.append("题%d" % len(got))
            sets.extend(got)
        except Exception as e:
            row.append("题ERR " + str(e)[:30])
        try:
            w = build_writing(f)
            if w:
                writings.append(w)
                row.append("作文" if w["sample"] else "作文·无范文")
            tr = build_translation(f)
            if tr:
                writings.append(tr)
                row.append("翻译" if tr["sample"] else "翻译·无译文")
        except Exception as e:
            row.append("写作ERR " + str(e)[:30])
        try:
            t = pdf_text(f)
            ans, _s, _n, _e = load_answers(f, t)
            if ans:
                ls = build_listening(f, ans)
                if ls:
                    listens.append(ls)
                    row.append("听力")
        except Exception as e:
            row.append("听力ERR " + str(e)[:30])
        rows.append(row)
    for r in rows:
        print("%-44s %s" % (r[0][:42], " | ".join(r[1:])))
    # 写作板块只收「有参考范文/译文」或「近 5 年」的题，免得 60 多道真题把列表撑爆
    writings = [w for w in writings if w.get("sample") or _recent(w["title"])]
    print("\n题目 %d 套 / 写作 %d 题 / 听力 %d 套" % (len(sets), len(writings), len(listens)))
    CACHE.joinpath("sets.json").write_text(json.dumps(sets, ensure_ascii=False, indent=1), encoding="utf-8")
    CACHE.joinpath("writing.json").write_text(json.dumps(writings, ensure_ascii=False, indent=1), encoding="utf-8")
    CACHE.joinpath("listening.json").write_text(json.dumps(listens, ensure_ascii=False, indent=1), encoding="utf-8")
    if "--emit" in sys.argv:
        emit(sets, writings, listens)


HEADER = """/* 历年真题（由 tools/build_pack.py 从 PDF 抽取，勿手改）
   ------------------------------------------------------------------
   来源：四六级真题+资料包 / 2014-2025年六级真题
   答案只认两种可核验来源：
     ①「答案速查」的字母表 —— 必须按**坐标**还原网格顺序，文本流顺序会把答案整体错位；
     ②「解析」册里 【精析】/【语法判断】 前那个字母 —— 并用「整句引用命中数」证明这份解析就是这套题。
   编号错位的情况（2024年6月：速查册的范文页与答案页被拼串）写在 ANSRC_OVERRIDE 里，逐条人工核过。
*/"""


def sync_audio(listens) -> None:
    """把真题 mp3 转成网页体积（单声道 22.05kHz 48kbps）：26 MB 的原始录音 → 约 8 MB。
    转码失败就退回原文件拷贝 —— 宁可用大文件，也不能没声音。"""
    import shutil
    import subprocess
    for s in listens:
        for seg in s.get("segments", []):
            src = seg.pop("_src", "")
            dst = seg.pop("_dst", "")
            if not src or not dst:
                continue
            srcp, dstp = pathlib.Path(src), pathlib.Path(dst)
            dstp.parent.mkdir(parents=True, exist_ok=True)
            if dstp.exists() and dstp.stat().st_size > 100000:
                continue
            ok = False
            try:
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(srcp),
                                "-ac", "1", "-ar", "22050", "-b:a", "48k", str(dstp)],
                               check=True, timeout=600)
                ok = dstp.exists() and dstp.stat().st_size > 100000
            except Exception as e:
                print("  ffmpeg 失败（%s），改为直接拷贝" % str(e)[:40])
            if not ok:
                shutil.copyfile(srcp, dstp)
            print("  音频 %s → %.1f MB" % (dstp.name, dstp.stat().st_size / 1048576))


def emit(sets, writings, listens):
    def dump(name, var, data):
        js = HEADER + "\nwindow.%s = " % var + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
        (WDIR / "data" / name).write_text(js, encoding="utf-8")
        print("写出 data/%s（%d 项，%.0f KB）" % (name, len(data), len(js) / 1024))

    sync_audio(listens)
    dump("quiz-zhenti.js", "TW_QUIZ_ZHENTI", sets)
    dump("writing-zhenti.js", "TW_WRITING_ZHENTI", writings)
    dump("listening-zhenti.js", "TW_LISTENING_ZHENTI", listens)


if __name__ == "__main__":
    main()
