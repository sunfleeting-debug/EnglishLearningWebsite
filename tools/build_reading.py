# -*- coding: utf-8 -*-
"""生成 data/reading.js —— DRJ172 六级阅读（星火英语）网页版的数据源。

产出为 JS 全局变量 window.TW.READING，与 books.js / words.js 一致，
无需 fetch，file:// 双击即可用。

数据来源与可审计性：
- 页面图片：tools/render_reading.py 由三份扫描 PDF 渲染为 assets/reading/*/*.webp
- 文章结构（Model Test / Passage / 答案详解 的页码归属）：OCR 结果 tools/.cache/ocr/*.json
  经 tools/map_pages.py 汇总，见 tools/.cache/page_map.txt
- 答案：OCR 出的「答案详解」正文（tools/.cache/practice_text.txt）逐题人工核对后，
  以字面量的形式固化在下方 ANSWERS / 选项词表中（OCR 会把行拆散，正则不可靠，
  故不做自动解析，改为人工校对后写死——这是本文件唯一「手工」的部分）。
"""
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "reading.js")

# ---------------------------------------------------------------- 答案（已人工核对）
# 依据 tools/.cache/practice_text.txt 的「答案详解」段落逐条核对
# 选词填空 15 选 10：题号 1-10
MT1_CLOZE = list("FNIHD LJ OEB".replace(" ", ""))   # 1F 2N 3I 4H 5D 6L 7J 8O 9E 10B
# 段落信息匹配：题号 11-20，答案为段落字母
MT1_MATCH = list("CGFIEKOHNB")                       # 11C 12G 13F 14I 15E 16K 17O 18H 19N 20B
# 阅读理解 Passage 1：21-25
MT1_R1 = list("DBADA")
# 阅读理解 Passage 2：26-30
MT1_R2 = list("DACBC")

MT2_CLOZE = list("GIONDBMLAC")                       # 1G 2I 3O 4N 5D 6B 7M 8L 9A 10C
MT2_MATCH = list("GIBEC AHD FE".replace(" ", ""))     # 11G 12I 13B 14E 15C 16A 17H 18D 19F 20E
MT2_R1 = list("ACDAA")
MT2_R2 = list("BDACA")

# ---------------------------------------------------------------- 选词填空选项词表
# 来自题目页 OCR（practice p1 / p13），已对照「选项词性分类」复核
MT1_WORDS = [
    ("A", "ambiguous"), ("B", "complete"), ("C", "consensus"), ("D", "dominate"),
    ("E", "evident"), ("F", "examined"), ("G", "extract"), ("H", "fraction"),
    ("I", "magnitude"), ("J", "necessarily"), ("K", "overworked"), ("L", "related"),
    ("M", "resources"), ("N", "scant"), ("O", "threats"),
]
MT2_WORDS = [
    ("A", "accumulate"), ("B", "accuracy"), ("C", "alter"), ("D", "compared"),
    ("E", "conflicted"), ("F", "decreased"), ("G", "discouraged"), ("H", "distinguished"),
    ("I", "distribution"), ("J", "diversion"), ("K", "elevating"), ("L", "increased"),
    ("M", "location"), ("N", "predictive"), ("O", "volunteers"),
]

ALPHA15 = "ABCDEFGHIJKLMNO"
ALPHA4 = "ABCD"


def section(sid, label, en, rng, alpha, ans, hint, words=None):
    d = {
        "id": sid, "label": label, "en": en,
        "from": rng[0], "to": rng[1], "alpha": alpha,
        "ans": ans, "hint": hint,
    }
    if words:
        d["words"] = [{"k": k, "w": w} for k, w in words]
    return d


TESTS = [
    {
        "id": "mt1", "name": "Model Test 1",
        "sections": [
            section("a", "选词填空", "Section A", (1, 10), ALPHA15, MT1_CLOZE,
                    "从 A–O 十五个选项中选出十个，填入 1–10 题（15 选 10）", MT1_WORDS),
            section("b", "段落信息匹配", "Section B", (11, 20), ALPHA15, MT1_MATCH,
                    "为 11–20 每句话匹配所在段落（A–O）"),
            section("c1", "阅读理解 · Passage 1", "Section C", (21, 25), ALPHA4, MT1_R1,
                    "四选一，21–25 题"),
            section("c2", "阅读理解 · Passage 2", "Section C", (26, 30), ALPHA4, MT1_R2,
                    "四选一，26–30 题"),
        ],
        "quizPages": [1, 2, 3, 4, 5, 6],
        "answerPages": [7, 8, 9, 10, 11],
    },
    {
        "id": "mt2", "name": "Model Test 2",
        "sections": [
            section("a", "选词填空", "Section A", (1, 10), ALPHA15, MT2_CLOZE,
                    "从 A–O 十五个选项中选出十个，填入 1–10 题（15 选 10）", MT2_WORDS),
            section("b", "段落信息匹配", "Section B", (11, 20), ALPHA15, MT2_MATCH,
                    "为 11–20 每句话匹配所在段落（A–O）"),
            section("c1", "阅读理解 · Passage 1", "Section C", (21, 25), ALPHA4, MT2_R1,
                    "四选一，21–25 题"),
            section("c2", "阅读理解 · Passage 2", "Section C", (26, 30), ALPHA4, MT2_R2,
                    "四选一，26–30 题"),
        ],
        "quizPages": [12, 13, 14, 15, 16, 17],
        "answerPages": [18, 19, 20, 21, 22],
    },
]


def main():
    data = {
        "name": "六级阅读真题（DRJ172 简·六级阅读）",
        "source": "星火英语《简·六级阅读》",
        "generated": "2026-10-13",
        "practice": {
            "title": "海量练习",
            "desc": "2 套 Model Test，每套 30 题：选词填空 10 + 段落信息匹配 10 + 阅读理解 10",
            "pages": 22,
            "tests": TESTS,
        },
        "docs": [
            {
                "id": "translation", "title": "参考译文", "pages": 14,
                "desc": "全书逐篇参考译文，按 Test 编排",
            },
            {
                "id": "source", "title": "题源文章", "pages": 6,
                "desc": "真题文章的原始出处与题源分析",
            },
        ],
    }
    js = "/* 自动生成，请勿手改：python tools/build_reading.py */\n" \
         "window.TW = window.TW || {};\n" \
         "window.TW.READING = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
    print("written %s (%d bytes)" % (OUT, len(js.encode("utf-8"))))
    # 自检：答案长度必须等于题量
    for t in TESTS:
        for s in t["sections"]:
            n = s["to"] - s["from"] + 1
            assert len(s["ans"]) == n, "%s/%s 答案数 %d != 题量 %d" % (t["id"], s["id"], len(s["ans"]), n)
    print("self-check ok: %d tests, %d sections" % (len(TESTS), sum(len(t["sections"]) for t in TESTS)))


if __name__ == "__main__":
    main()
