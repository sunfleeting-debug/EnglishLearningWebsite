# -*- coding: utf-8 -*-
"""把 DRJ172《阅读海量练习》OCR 文本抽成题库 JSON → data/quiz.js

产出结构（window.TW_QUIZ）：
{
  updated: 'YYYY-MM-DD',
  sets: [{
    id: 'mt1-p1',           # 唯一 id
    test: 'Model Test 1',
    no: 1,                  # Passage 编号
    type: 'cloze'|'match'|'reading',
    source: 'Financial Times',
    topic: '商业经济',
    minutes: 7,
    title: '...',           # 短标题（cloze 用首个实义词组，reading 用原文标题或首句）
    body: ['段1', '段2'],    # cloze/reading 的正文；cloze 内含 【1】..【10】 挖空位
    paras: [{k:'A', text:'...'}],  # match 的段落（带字母）
    bank: [{k:'A', w:'ambiguous'}], # cloze 词库
    questions: [{n:1, stem:'', options:['..'], answer:'F', key:'examined', explain:'...'}],
    translation: '参考译文全文'      # 可选
  }]
}
用法：python tools/build_quiz_bank.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
TXT = os.path.join(CACHE, "practice_text.txt")
OCR = os.path.join(CACHE, "ocr", "practice.json")
OUT = os.path.join(ROOT, "data", "quiz.js")

WM = re.compile(r"星火|Spark|^spa[rl]$|^英语$|^火英语$", re.I)

# 扫描件里个别段落字母被整块吞掉（实测：MT2 P2 的 G 段段首、I 段的字母），
# 这里按「该段首句」锚点手工切开补字母——宁可写死两条，也不要让用户看到缺段。
PARA_PATCH = {
    "mt2-p2": [
        ("business laws differ from state to state", "G", "Because labour and"),
        ("Now maybe unionised Boeing workers should be more worried", "I", ""),
    ],
}


# ---------------------------------------------------------------- 读文本
def read_lines():
    out = []
    with open(TXT, encoding="utf-8") as f:
        for raw in f:
            s = raw.rstrip()
            if s.startswith("=========="):
                continue
            t = s.strip()
            if not t:
                continue
            if re.fullmatch(r"\d{1,2}", t):     # 页脚页码
                continue
            if WM.search(t):
                continue
            out.append(t)
    return out


def join_cn(lines):
    """中文/英文混排的折行还原：英文行之间补空格，中文行之间直接拼。"""
    out = ""
    for ln in lines:
        if not out:
            out = ln
        elif re.search(r"[\u4e00-\u9fff，。；：、）】」]$", out) or re.match(r"^[\u4e00-\u9fff（【]", ln):
            out += ln
        else:
            out += " " + ln
    return re.sub(r"\s+", " ", out).strip()


def join_en(lines):
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


# ---------------------------------------------------------------- 词库（A-O）
def word_banks():
    """从 OCR 原始块按「3 列 × 5 行」网格还原 A-O 词库。

    扫描件里字母与单词被拆成独立文本框（且 'I)'、'J)'、'0)' 常丢/误识别），
    所以先取出候选单词，再按「列优先」排序赋值 A..O —— 这正是书上三栏排版的顺序。
    """
    d = json.load(open(OCR, encoding="utf-8"))
    banks = []
    for pg in d["pages"]:
        items = []
        for it in pg["items"]:
            t = it["text"].strip()
            if WM.search(t):
                continue
            m = re.fullmatch(r"(?:[A-O0]\s*[)）.、]\s*)?([a-z]{3,})", t)
            if not m:
                continue
            xs = [p[0] for p in it["box"]]
            ys = [p[1] for p in it["box"]]
            items.append((sum(ys) / 4.0, sum(xs) / 4.0, m.group(1)))
        if len(items) != 15:
            continue
        xs = sorted(i[1] for i in items)
        # 3 列：按 x 的三分位聚类
        lo, hi = xs[0], xs[-1]
        w = (hi - lo) / 3.0 or 1
        rows = {}
        for y, x, word in items:
            col = min(2, max(0, int((x - lo) / w + 0.4)))
            rows.setdefault(col, []).append((y, word))
        seq = []
        for col in (0, 1, 2):
            seq.extend(w for _, w in sorted(rows.get(col, [])))
        if len(seq) != 15 or len(set(seq)) != 15:
            continue
        banks.append({
            "page": pg["page"],
            "list": [{"k": chr(65 + i), "w": w} for i, w in enumerate(seq)],
        })
    return banks


# ---------------------------------------------------------------- 结构切分
MARK_PASSAGE = re.compile(r"^Passage\s*(\d)$")
MARK_TEST = re.compile(r"^Model Test\s*(\d)$")
MARK_ANS = re.compile(r"答案(解析|详解)")
MARK_TRANS = re.compile(r"^[>0oO]?\s*参\s*考\s*译\s*文$")


def split_blocks(lines):
    """按 Model Test / Passage 切成块，每块标记是「题目区」还是「答案解析区」。"""
    idx = []
    for i, ln in enumerate(lines):
        m = MARK_TEST.match(ln)
        if m:
            idx.append({"i": i, "kind": "test", "no": int(m.group(1))})
            continue
        m = MARK_PASSAGE.match(ln)
        if m:
            idx.append({"i": i, "kind": "passage", "no": int(m.group(1))})
    # 归属 Model Test
    cur_test = 0
    for k in idx:
        if k["kind"] == "test":
            cur_test = k["no"]
        k["test"] = cur_test
    # 每个 Passage 块的结束位置
    pass_idx = [k for k in idx if k["kind"] == "passage"]
    for n, k in enumerate(pass_idx):
        k["end"] = pass_idx[n + 1]["i"] if n + 1 < len(pass_idx) else len(lines)
        body = lines[k["i"]:k["end"]]
        k["is_ans"] = any(MARK_ANS.match(x) for x in body)
    return pass_idx


def head_fields(lines):
    src = topic = ""
    mins = 0
    for ln in lines[:6]:
        m = re.match(r"^题源[:：]\s*(.+)$", ln)
        if m:
            src = m.group(1).strip()
        m = re.match(r"^题材[:：]\s*(.+)$", ln)
        if m:
            topic = m.group(1).strip()
        m = re.match(r"^建议用时[:：]\s*(\d+)\s*分钟", ln)
        if m:
            mins = int(m.group(1))
    return src, topic, mins


# ---------------------------------------------------------------- 题目区
def parse_bank_lines(block, bank):
    """从题目区里剥掉 A)~O) 词库行，返回正文行。"""
    body = []
    for ln in block:
        if re.match(r"^[A-O0]\s*[)）.、]\s*[a-z]", ln):
            continue
        if ln in ("选项词性分类",) or ln.startswith("选项词性"):
            continue
        body.append(ln)
    return body


def blankify(text, total=10):
    """把正文里的挖空标记统一成 【n】。

    OCR 把下划线吞得七零八落：`_1_` / `4_` / `to  5 the` / `and8` 都出现过。
    挖空编号一定按 1→10 顺序出现，所以按「顺序找下一个 n」的策略，比死磕正则稳。
    """
    out = text
    pos = 0
    misses = []
    for n in range(1, total + 1):
        pat = re.compile(r"(?<![\d])(?:_*\s*%d\s*_*)(?![\d])" % n)
        m = pat.search(out, pos)
        if not m:
            misses.append(n)
            continue
        out = out[:m.start()] + "【%d】" % n + out[m.end():]
        pos = m.start() + len("【%d】" % n)
    return out, misses


def split_sentences_paras(lines):
    """把折行拼回段落：题号行 / 空行 / 大小写断句作为弱边界。"""
    paras, cur = [], []
    for ln in lines:
        cur.append(ln)
        # 段落结束的迹象：行以句号/问号/引号结尾，且下一行看起来是新段落开头
    return paras or cur


def parse_question_block(block, mtype_hint=None):
    """题目区解析：返回 (body_lines, bank_letters_used, questions)"""
    body = []
    questions = []
    cur = None
    i = 0
    while i < len(block):
        ln = block[i]
        # 仔细阅读：`21. stem` 或 `21．stem`
        m = re.match(r"^(\d{1,2})\s*[.．、]\s*(.+)$", ln)
        if m and 11 <= int(m.group(1)) <= 40:
            cur = {"n": int(m.group(1)), "stem": m.group(2).strip(), "options": []}
            questions.append(cur)
            i += 1
            continue
        # 选项 A) .. D)
        m = re.match(r"^([A-O])\s*[)）.、]\s*(.+)$", ln)
        if m and cur is not None:
            cur["options"].append((m.group(1), m.group(2).strip()))
            i += 1
            continue
        if cur is None:
            body.append(ln)
        else:
            # 题干续行：小写开头 / 逗号结尾 / 无标点 → 认为是上一题的续行
            if cur["options"]:
                pass
            elif not re.match(r"^[A-Z【]", ln) or ln.endswith(","):
                cur["stem"] = (cur["stem"] + " " + ln).strip()
        i += 1
    return body, questions


# ---------------------------------------------------------------- 答案解析区
NUM_ANS = re.compile(r"^(\d{1,2})\s*[.。．，,]?\s*(?:【定位】|([A-O0])\s*[）)】])")
# 答案字母后面跟的标点被 OCR 弄得很杂：`【解析】C）。` / `【解析】A。` / `【解析】A】。`
ANS_LETTER = re.compile(r"【解析】\s*([A-O0])\s*[）)】。．，,]")


def parse_answer_block(block):
    """返回 {n: {letter, explain}}，letter 可能是段落字母（匹配题）或选项字母。"""
    txt = []
    for ln in block:
        if MARK_ANS.match(ln) or MARK_TRANS.match(ln) or MARK_PASSAGE.match(ln):
            continue
        if re.match(r"^(D|〇|【)?\s*文章大意", ln):
            continue
        txt.append(ln)
    segs = []
    cur = None
    for ln in txt:
        m = NUM_ANS.match(ln)
        if m:
            letter = (m.group(2) or "").upper()
            if letter == "0":
                letter = "O"
            cur = {"n": int(m.group(1)), "letter": letter, "lines": [ln[m.end():].strip()]}
            segs.append(cur)
            continue
        if cur is None and ln.startswith("【解析】"):
            # 题号那一行被 OCR 吞了（实测有），先挂一个无名段，稍后按顺序补号
            cur = {"n": None, "letter": "", "lines": [ln]}
            segs.append(cur)
            continue
        if cur is not None:
            if MARK_TRANS.match(ln):
                cur = None
                continue
            cur["lines"].append(ln)
    # 补号：无名段 = 上一段号 + 1；没有上一段取下一段号 - 1
    last = 0
    for i, s in enumerate(segs):
        if s["n"] is not None:
            last = s["n"]
            continue
        nxt = next((x["n"] for x in segs[i + 1:] if x["n"] is not None), None)
        s["n"] = last + 1 if last else ((nxt - 1) if nxt else 1)
        last = s["n"]
    out = {}
    for a in segs:
        body = join_cn([x for x in a["lines"] if x])
        body = re.sub(r"^【解析】", "", body).strip()
        letter = a["letter"]
        if not letter:
            m = ANS_LETTER.search("【解析】" + body) or re.search(r"^([A-O0])\s*[）)】。．，,]", body)
            if m:
                letter = ("O" if m.group(1) == "0" else m.group(1)).upper()
        out[a["n"]] = {"letter": letter, "explain": body}
    return out


def parse_translation(block):
    lines = []
    on = False
    for ln in block:
        if MARK_TRANS.match(ln):
            on = True
            continue
        if on:
            lines.append(ln)
    return join_cn(lines) if lines else ""


# ---------------------------------------------------------------- 主流程
def main():
    lines = read_lines()
    blocks = split_blocks(lines)
    banks = word_banks()
    print("检测到词库：", [(b["page"], len(b["list"])) for b in banks])

    # 每个 Model Test 里 Passage 1~4 出现**两轮**：前一轮是题目，后一轮是答案解析。
    # 不能靠 is_ans 判断——第 4 篇的题目区末尾就压着下一半的「答案详解」标记（实测踩中）。
    groups = {}
    for b in blocks:
        groups.setdefault(b["test"], []).append(b)
    pairs = []
    for t in sorted(groups):
        bs = groups[t]
        if len(bs) != 8:
            print("!! Model Test %d 的 Passage 块数 %d（应为 8）" % (t, len(bs)))
        half = len(bs) // 2
        for qb, ab in zip(bs[:half], bs[half:]):
            pairs.append((qb, ab))
    print("题目块 %d，解析块 %d" % (len(pairs), len(pairs)))

    sets = []
    for qb, ab in pairs:
        raw = lines[qb["i"] + 1:qb["end"]]
        ans_raw = lines[ab["i"]:ab["end"]]
        raw = [x for x in raw if not MARK_ANS.match(x) and not MARK_TRANS.match(x)]
        answers = parse_answer_block(ans_raw)
        translation = parse_translation(ans_raw)
        src, topic, mins = head_fields(raw)

        # 选词填空的解析固定写「1.F）动词辨析题。…」，题干是 A)~O) 词库 + _n_ 挖空
        is_cloze = any(re.search(r"(名词|动词|形容词|副词)辨析题", v["explain"]) for v in answers.values())
        body_lines = [ln for ln in raw if not re.match(r"^题源|^题材|^建议用时|^选项", ln)]

        if is_cloze:
            bank = banks[len([s for s in sets if s["type"] == "cloze"])] if len(banks) > len([s for s in sets if s["type"] == "cloze"]) else None
            body_lines = parse_bank_lines(body_lines, bank)
            text = join_en(body_lines)
            text, misses = blankify(text, len(answers) or 10)
            # 挖空标记前后补空格：OCR 里 `_1` 常紧贴单词，还原后要有可读的间隔
            text = re.sub(r"】(?=[A-Za-z])", "】 ", text)
            text = re.sub(r"(?<=[A-Za-z，,、])【", " 【", text)
            if misses:
                print("  !! %d 篇挖空编号漏识别：%s" % (qb["no"], misses))
            qs = []
            for n in sorted(answers):
                a = answers[n]
                word = ""
                if bank:
                    for kv in bank["list"]:
                        if kv["k"] == a["letter"]:
                            word = kv["w"]
                qs.append({
                    "n": n, "stem": "第 %d 空" % n, "options": [],
                    "answer": a["letter"], "key": word, "explain": a["explain"],
                })
            setobj = {
                "id": "mt%d-p%d" % (qb["test"], qb["no"]), "test": "Model Test %d" % qb["test"],
                "no": qb["no"], "type": "cloze", "source": src, "topic": topic, "minutes": mins,
                "title": "选词填空", "body": split_paras(text),
                "bank": bank["list"] if bank else [], "questions": qs, "translation": translation,
            }
        else:
            body, qs_raw = parse_question_block(body_lines)
            is_match = bool(qs_raw) and all(not q["options"] for q in qs_raw)
            # match：正文其实是 A)~O) 段落，parse_question_block 会把带字母的行当选项吃了，
            # 所以正文用原始行还原
            if is_match:
                paras = []
                cur = None
                pre = []
                for ln in body_lines:
                    m = re.match(r"^([A-O0])\s*[)）.、]\s*(.*)$", ln)
                    if m and int(qs_raw[0]["n"]) > 10:
                        letter = "O" if m.group(1) == "0" else m.group(1)
                        rest = m.group(2).strip()
                        # OCR 常把「F)」单独切成一行、正文另起一行，所以空标记也算新段落
                        if not rest or len(rest) > 2:
                            cur = {"k": letter, "lines": [rest] if rest else []}
                            paras.append(cur)
                            continue
                    if cur is None:
                        pre.append(ln)
                    else:
                        cur["lines"].append(ln)
                for p in paras:
                    p["text"] = join_en(p.pop("lines"))
                # 首段之前的那两行：一行是文章标题，剩下的其实是 A) 段（A) 标记被 OCR 吞了）
                pre = [x for x in pre if not re.match(r"^[A-O0]\s*[)）.、]", x)]
                title_line = ""
                if pre:
                    first = pre[0]
                    if len(first) < 90 and not re.search(r"[.?!]$", first):
                        title_line = re.sub(r"(?<=[a-z])(?=[A-Z][a-z])", " ", first)
                        pre = pre[1:]
                    if pre and (not paras or paras[0]["k"] != "A"):
                        paras.insert(0, {"k": "A", "text": join_en(pre)})
                # 段落字母被整块吞掉的个别段落：按首句锚点手工切开补字母
                for anchor, letter, prefix in PARA_PATCH.get("mt%d-p%d" % (qb["test"], qb["no"]), []):
                    for p in paras:
                        idx = p["text"].find(anchor)
                        if idx > 0:
                            rest = p["text"][idx:]
                            p["text"] = p["text"][:idx].strip()
                            paras.insert(paras.index(p) + 1,
                                         {"k": letter, "text": (prefix + " " + rest).strip()})
                            break
            out_qs = []
            for q in qs_raw:
                a = answers.get(q["n"], {})
                opts = [{"k": k, "t": t} for k, t in q["options"]]
                out_qs.append({
                    "n": q["n"], "stem": q["stem"], "options": opts,
                    "answer": a.get("letter", ""), "explain": a.get("explain", ""),
                })
            qtype = "match" if is_match else "reading"
            setobj = {
                "id": "mt%d-p%d" % (qb["test"], qb["no"]), "test": "Model Test %d" % qb["test"],
                "no": qb["no"], "type": qtype, "source": src, "topic": topic, "minutes": mins,
                "title": "段落匹配" if qtype == "match" else "仔细阅读",
                "heading": (title_line if qtype == "match" else ""),
                "body": [] if qtype == "match" else split_paras(join_en(body)),
                "paras": paras if qtype == "match" else [],
                "questions": out_qs, "translation": translation,
            }
        miss = [q["n"] for q in setobj["questions"] if not q["answer"] or not q["explain"]]
        print("%-12s %-8s 题 %2d 答案 %2d 解析 %2d 缺 %s" % (
            setobj["id"], setobj["type"], len(setobj["questions"]), len(answers),
            sum(1 for q in setobj["questions"] if q["explain"]), miss))
        sets.append(setobj)

    data = {"updated": "2026-11-04", "sets": sets}
    js = "/* 六级阅读题库（由 tools/build_quiz_bank.py 从 DRJ172 扫描件 OCR 生成，勿手改） */\n" \
         "window.TW_QUIZ = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(js)
    print("written", OUT, "%.1f KB" % (len(js.encode("utf-8")) / 1024.0))


def split_paras(text):
    """正文按「句号 + 空格 + 大写」粗分段，太长再切成 3-4 句一段。"""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?\"）])\s+(?=[A-Z“【])", text)
    out, buf, n = [], [], 0
    for p in parts:
        buf.append(p)
        n += len(p)
        if n > 420:
            out.append(" ".join(buf))
            buf, n = [], 0
    if buf:
        out.append(" ".join(buf))
    return out


if __name__ == "__main__":
    main()
