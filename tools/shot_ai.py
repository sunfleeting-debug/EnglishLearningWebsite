# -*- coding: utf-8 -*-
"""AI 教练聊天页视觉核验截图（mock SSE，不触网）。

用法：NODE_OPTIONS= python -u tools/shot_ai.py
输出：tools/_shots/ai-*.png
"""
import json
import os
import pathlib
import re

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
OUT = pathlib.Path("tools/_shots")
OUT.mkdir(parents=True, exist_ok=True)


def pool_lines(system_text):
    out = []
    for l in system_text.splitlines():
        if " | " not in l:
            continue
        p = [x.strip() for x in l.lstrip("- ").split("|")]
        if len(p) < 3:
            continue
        if not re.match(r"^[A-Za-z0-9:_-]+$", p[0]) or p[0] in ("id", "-"):
            continue
        out.append((p[0], p[1], p[2]))
    return out


def sse(text):
    parts = [text[i:i + 16] for i in range(0, len(text), 16)]
    body = "".join("data: " + json.dumps({"choices": [{"delta": {"content": p}}]}, ensure_ascii=False) + "\n\n"
                   for p in parts)
    return body + "data: [DONE]\n\n"


def handler(route):
    body = json.loads(route.request.post_data or "{}")
    system = body.get("system", "")
    user = ""
    for m in reversed(body.get("messages") or []):
        if m.get("role") == "user":
            user = m.get("content", "")
            break

    if "出 8 道题" in user or "出 8 题" in user:
        pool = pool_lines(system)
        a = pool[0] if pool else ("", "abandon", "v. 放弃")
        b = pool[1] if len(pool) > 1 else ("", "abstract", "a. 抽象的")
        c = pool[2] if len(pool) > 2 else ("", "academic", "a. 学术的")
        d = pool[3] if len(pool) > 3 else ("", "accommodate", "v. 容纳")
        quiz = {"exercises": [
            {"id": a[0], "word": a[1], "type": "choice",
             "question": "He had to ___ the plan because of the storm.（放弃）",
             "options": ["absorb", a[1], "accent", "access"],
             "answer": a[1],
             "explanation": a[1] + " = 放弃；abandon a plan / abandon oneself to 都是高频搭配。"},
            {"id": b[0], "word": b[1], "type": "spell",
             "question": "a. 抽象的；抽象派的（a______，8 个字母）",
             "options": [], "answer": b[1],
             "explanation": "abstract 与 attract 只差中间几个字母，记 ab-stract（abs 离开 + tract 拉）。"},
            {"id": c[0], "word": c[1], "type": "fill",
             "question": "She has a strong ___ background in linguistics.",
             "options": [], "answer": c[1],
             "explanation": "academic background = 学术背景；academic 重音在 -dem-。"},
            {"id": d[0], "word": d[1], "type": "choice",
             "question": "This hall can ___ up to 500 people.（容纳）",
             "options": ["accompany", "accumulate", d[1], "accomplish"],
             "answer": d[1],
             "explanation": "accommodate = 容纳/为…提供住宿；accommodate to 适应。"},
        ]}
        text = ("这组题挑的都是你反复错的词：两个选择、一个拼写、一个填空。做完交卷，我按错题再讲一遍。\n\n"
                "```quiz\n" + json.dumps(quiz, ensure_ascii=False) + "\n```")
    elif "分析" in user:
        text = ("**结论：你不是记不住新词，是在反复错同一批。**\n\n"
                "- 近 7 天做了 24 题，正确率 75%，但听音写词只有 61%\n"
                "- 错词集中在 6 个上，平均错 3 次，且都没进复习队列\n\n"
                "今天的动作：用**听音写词**过 8 个错词（约 5 分钟），错的当场跟读两遍；睡前用翻卡把到期词过一遍，只求 1 秒内反应出中文。明天再加 20 个新词。")
    elif "错" in user and "帮我讲" in user:
        text = ("**问题出在「音」和「形」没对上，不是没背过。**\n\n"
                "1. **abandon**：a-ban-don，重音在第二音节；记 a + band（乐队）+ on —— 乐队走了，就是「放弃」。\n"
                "2. **abstract**：abs（离开）+ tract（拉）→ 从具体里拉出来 = 抽象的；别和 attract（at + tract 拉向）混。\n\n"
                "接下来 24 小时：把这 2 个词各朗读 5 遍，再用听音写词重做一次。")
    else:
        text = ("**先解决错词。**\n\n"
                "- 今天用听音写词过 8 个错词，约 5 分钟\n"
                "- 睡前把到期的 12 个词过一遍，只认中文\n\n"
                "你近 7 天正确率 75%，短板在听音写词（61%）——先补这一项，不要急着刷新词。")

    if body.get("stream"):
        route.fulfill(status=200, content_type="text/event-stream",
                      headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
                      body=sse(text))
    else:
        route.fulfill(status=200, content_type="application/json",
                      headers={"Access-Control-Allow-Origin": "*"},
                      body=json.dumps({"text": text, "model": "mock-1"}))


def setup(pg):
    pg.add_init_script("try{localStorage.setItem('typingcet.guest','1');}catch(e){}")
    pg.add_init_script("""try{
        localStorage.setItem('typingcet.ai.v1', JSON.stringify({
            provider:'deepseek', keys:{deepseek:'sk-mock-1234567890'},
            models:{deepseek:'deepseek-chat'}, baseUrl:''
        }));
    }catch(e){}""")
    pg.route("**/api/ai/chat", handler)
    pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.TW && TW.ai && TW.app")
    pg.evaluate("""() => {
        const ws = TW.data.words.slice(0, 12);
        ws.forEach((w, i) => {
            TW.store.state.progress[w.id] = {
                w: (i % 3) + 1, r: 2, seen: 6, fav: i % 5 === 0, master: false,
                ts: Date.now() - i * 60000, word: w.word, src: w.book || '',
                brief: TW.data.brief(w), streak: 0
            };
        });
        TW.store.state.daily[TW.store.today()] = { done: 24, right: 18 };
        TW.store.save();
    }""")
    pg.wait_for_timeout(400)          # store.save() 有 120ms 防抖，等它落盘
    pg.reload()                       # 欢迎页要读到刚注入的数据，必须重载
    pg.wait_for_function("() => window.TW && window.TW.ai")
    pg.wait_for_timeout(500)


def main():
    with sync_playwright() as p:
        kw = {"headless": True}
        if EXE.exists():
            kw["executable_path"] = str(EXE)
        browser = p.chromium.launch(**kw)

        pg = browser.new_page(viewport={"width": 1280, "height": 900})
        setup(pg)
        pg.wait_for_timeout(700)
        pg.screenshot(path=str(OUT / "ai-01-welcome.png"))

        pg.click('.ai-quiz-sug, .ai-sug:nth-child(2)')
        pg.wait_for_selector(".ai-quizbox", timeout=8000)
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / "ai-02-quiz.png"))

        # 第 1 题故意选错（A absorb），第 2 题拼对
        pg.evaluate("""() => {
            const q = document.querySelectorAll('.ai-q')[0];
            q.querySelectorAll('.ai-opt')[0].click();
        }""")
        pg.fill('.ai-input[data-i="1"]', "abstract")
        pg.click('.ai-quizbox [data-act="grade"]')
        pg.wait_for_selector(".ai-quizbox .ai-score", timeout=5000)
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / "ai-03-graded.png"))

        pg.click('.ai-quizbox [data-act="review"]')
        pg.wait_for_function("() => document.querySelectorAll('.ai-row.assistant').length >= 2", timeout=10000)
        pg.wait_for_timeout(600)
        pg.screenshot(path=str(OUT / "ai-04-review.png"))

        # 深色
        pg.evaluate("() => { TW.store.setSetting('theme','dark'); document.documentElement.classList.add('dark'); }")
        pg.wait_for_timeout(400)
        pg.screenshot(path=str(OUT / "ai-05-dark.png"))

        # 移动端：欢迎页 + 出题
        m = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
        setup(m)
        m.screenshot(path=str(OUT / "ai-06-mobile-welcome.png"))
        m.click('.ai-sug:nth-child(2)')
        m.wait_for_selector(".ai-quizbox", timeout=8000)
        m.wait_for_timeout(500)
        m.screenshot(path=str(OUT / "ai-07-mobile-quiz.png"))

        # 矮屏（1366×768）：确认聊天壳不会被挤到视口外
        s = browser.new_page(viewport={"width": 1366, "height": 768})
        setup(s)
        s.screenshot(path=str(OUT / "ai-08-short.png"))

        print("shots ->", OUT)
        os._exit(0)


if __name__ == "__main__":
    main()
