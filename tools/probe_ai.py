# -*- coding: utf-8 -*-
"""AI 教练（ChatGPT 式聊天页）探针 —— 模型接口全部 mock 成 SSE，不触网。

覆盖：
1) 未配置 → 只出「接入模型」卡（5 个提供方、Key/模型）；
2) 保存并开始 → 进入聊天壳（欢迎页 + 4 张建议卡）；
3) 点「来一组练习」→ 流式回复里带 ```quiz 代码块 → 渲染成可作答卡片；
4) 作答 + 交卷 → 100%，写回 store（markRight）与场次记录（sessions）；
5) 「让教练讲讲错题」→ 把错题作为用户消息发回去（全对时问下一步）；
6) 新对话 → 回到欢迎页；
7) 直接输入 + Enter 发送 → 助手气泡渲染 markdown；
8) 设置页 AI 卡、深色主题、无 JS 报错。

用法：NODE_OPTIONS= python -u tools/probe_ai.py
"""
import json
import os
import pathlib
import re

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")

total = 0
fails = []


def check(name, cond, extra=""):
    global total
    total += 1
    print(("[OK]   " if cond else "[FAIL] ") + name + (("  -> " + str(extra)) if extra and not cond else ""))
    if not cond:
        fails.append(name)


def pool_lines(system_text):
    """候选词表在 system 里，每行 `id | 单词 | 释义`（没有列表符号）。
    只认第一段长得像 id 的行，跳过「【候选词表】（id | 单词 | 中文释义）」表头。"""
    out = []
    for l in system_text.splitlines():
        if " | " not in l:
            continue
        p = [x.strip() for x in l.lstrip("- ").split("|")]
        if len(p) < 2:
            continue
        if not re.match(r"^[A-Za-z0-9:_-]+$", p[0]) or p[0] in ("id", "-"):
            continue
        out.append((p[0], p[1]))
    return out


def sse(text):
    """把整段文本包成 OpenAI 风格的 SSE（分 3 段，验证增量拼接）"""
    parts = [text[:20], text[20:60], text[60:]] if len(text) > 60 else [text]
    chunks = []
    for p in parts:
        if not p:
            continue
        chunks.append("data: " + json.dumps({"choices": [{"delta": {"content": p}}]}, ensure_ascii=False) + "\n\n")
    chunks.append("data: [DONE]\n\n")
    return "".join(chunks)


def make_route(state):
    def handler(route):
        body = json.loads(route.request.post_data or "{}")
        system = body.get("system", "")
        msgs = body.get("messages") or []
        user = ""
        for m in reversed(msgs):
            if m.get("role") == "user":
                user = m.get("content", "")
                break
        stream = bool(body.get("stream"))

        if "连通性测试" in system:
            text = "ok"
        elif "出 8 道题" in user or "出 8 题" in user:
            pool = pool_lines(system)
            w1, id1 = (pool[0][1], pool[0][0]) if pool else ("abandon", "")
            w2, id2 = (pool[1][1], pool[1][0]) if len(pool) > 1 else ("abstract", "")
            state["words"] = [(id1, w1), (id2, w2)]
            quiz = {
                "exercises": [
                    {"id": id1, "word": w1, "type": "choice",
                     "question": "He had to ___ the plan because of the storm.（放弃）",
                     "options": ["absorb", w1, "accent", "access"],
                     "answer": w1,
                     "explanation": "abandon a plan = 放弃计划，高频搭配。"},
                    {"id": id2, "word": w2, "type": "spell",
                     "question": "a. 抽象的；抽象派的（提示：8 个字母）",
                     "options": [], "answer": w2,
                     "explanation": w2 + " 与 attract 形近，注意中间字母。"},
                ]
            }
            text = ("这组题练你错得最多的两个词，一个选择、一个拼写，做完我帮你复盘。\n\n"
                    "```quiz\n" + json.dumps(quiz, ensure_ascii=False) + "\n```")
        elif "分析" in user:
            text = ("**结论：你不是记不住新词，是在反复错同一批。**\n\n"
                    "- 近 7 天做了 24 题，正确率 75%\n"
                    "- 错词集中在 6 个上，平均错 3 次\n\n"
                    "今天先用听音写词过 8 个错词，约 5 分钟。")
        else:
            text = "**先解决错词**\n- 今天过 8 个错词\n- 睡前复习到期词"

        if stream:
            route.fulfill(status=200, content_type="text/event-stream",
                          headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
                          body=sse(text))
        else:
            route.fulfill(status=200, content_type="application/json",
                          headers={"Access-Control-Allow-Origin": "*"},
                          body=json.dumps({"text": text, "model": "mock-1"}))
    return handler


def main():
    state = {}
    with sync_playwright() as p:
        kw = {"headless": True}
        if EXE.exists():
            kw["executable_path"] = str(EXE)
        browser = p.chromium.launch(**kw)
        pg = browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        pg.add_init_script("try{localStorage.setItem('typingcet.guest','1');"
                           "localStorage.removeItem('typingcet.ai.v1');}catch(e){}")
        pg.route("**/api/ai/chat", make_route(state))
        pg.route("**/api/ai/models", lambda route: route.fulfill(
            status=200, content_type="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            body=json.dumps({"models": ["deepseek-chat", "deepseek-reasoner"], "provider": "deepseek"})))
        # 联网检索也 mock 掉：正常情况不该被触发（见下面第 6 步的断言），
        # 万一以后哪句样本命中了 WEB_HINT，也不会真的去连 workers.dev 拖慢探针。
        searches = []

        def fake_search(route):
            searches.append(route.request.post_data)
            route.fulfill(status=200, content_type="application/json",
                          headers={"Access-Control-Allow-Origin": "*"},
                          body=json.dumps({"results": [], "engine": "mock", "q": ""}))

        pg.route("**/api/ai/search", fake_search)

        pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
        pg.wait_for_function("() => window.TW && TW.ai && TW.app")
        pg.wait_for_timeout(600)

        # ---- 1. 未配置 ----
        check("导航有 AI 助手入口", pg.evaluate(
            "() => [...document.querySelectorAll('.nav-item')].some(b => b.textContent.includes('AI 助手'))"))
        check("未配置时不显示聊天壳", pg.evaluate("() => !document.querySelector('#ai-msgs')"))
        check("提供方 5 个", pg.evaluate("() => document.querySelectorAll('.ai-prov-btn').length") == 5)
        check("有 Key 输入框", pg.evaluate("() => !!document.querySelector('#ai-key')"))

        # ---- 2. 填 Key 自动拉模型列表 → 选模型 → 保存并开始 ----
        pg.fill("#ai-key", "sk-mock-1234567890")
        pg.wait_for_selector("#ai-model-select", timeout=8000)
        pg.wait_for_timeout(200)
        n_opts = pg.evaluate("() => document.querySelectorAll('#ai-model-select option').length")
        check("模型下拉列出 2 个", n_opts == 2, n_opts)
        check("没有模型输入框（列表模式）", pg.evaluate("() => !document.querySelector('#ai-model')"))

        pg.click("#ai-model-manual")
        check("可切到手动填写", pg.evaluate("() => !!document.querySelector('#ai-model')"))
        pg.click("#ai-model-modes")
        pg.wait_for_selector("#ai-model-select", timeout=5000)

        pg.select_option("#ai-model-select", "deepseek-reasoner")
        check("选中的模型已保存",
              pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.ai.v1')).models.deepseek")
              == "deepseek-reasoner")

        pg.click("#ai-save-test")
        pg.wait_for_selector("#ai-msgs", timeout=8000)
        pg.wait_for_timeout(300)
        check("进入聊天壳", pg.evaluate("() => !!document.querySelector('#ai-msgs')"))
        check("欢迎页 4 张建议卡", pg.evaluate("() => document.querySelectorAll('.ai-sug').length") == 4)
        check("Key 已落本地", pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.ai.v1')).keys.deepseek")
              == "sk-mock-1234567890")

        # 注入学习数据（真实词库前 6 个词，各错 3 次）
        words = pg.evaluate("""() => {
            const ws = TW.data.words.slice(0, 6);
            ws.forEach((w, i) => {
                TW.store.state.progress[w.id] = {
                    w: 3, r: 1, seen: 4, fav: false, master: false,
                    ts: Date.now() - i * 1000, word: w.word, src: w.book || '',
                    brief: TW.data.brief(w), streak: 0
                };
            });
            TW.store.state.daily[TW.store.today()] = { done: 24, right: 18 };
            TW.store.save();
            return ws.map(w => ({id: w.id, word: w.word}));
        }""")
        check("注入 6 个错词", len(words) == 6)

        # ---- 3. 出题（走建议卡）----
        pg.click('.ai-sug:nth-child(2)')          # 「来一组练习」
        pg.wait_for_selector(".ai-quizbox", timeout=10000)
        pg.wait_for_timeout(300)
        check("用户消息上屏", pg.evaluate("() => document.querySelectorAll('.ai-row.user').length") == 1)
        check("quiz 代码块被摘掉（不显示 ```quiz）", pg.evaluate(
            "() => !document.querySelector('.ai-msgs').textContent.includes('```')"))
        check("渲染 2 道题", pg.evaluate("() => document.querySelectorAll('.ai-q').length") == 2)
        check("判分前不显示答案词", pg.evaluate("() => document.querySelectorAll('.ai-q-word').length") == 0)
        check("选项不带 A./B. 前缀", pg.evaluate(
            "() => [...document.querySelectorAll('.ai-opt span')].every(s => !/^[A-Da-d][.、)]/.test(s.textContent))"))

        w1 = state["words"][0][1]
        w2 = state["words"][1][1]
        pg.evaluate("""(ans) => {
            const q = document.querySelector('.ai-q');
            [...q.querySelectorAll('.ai-opt')].find(b => b.textContent.trim().endsWith(ans)).click();
        }""", w1)
        pg.fill(".ai-quizbox .ai-input", w2)
        pg.click('.ai-quizbox [data-act="grade"]')
        pg.wait_for_selector(".ai-quizbox .ai-score", timeout=5000)
        pg.wait_for_timeout(200)
        check("判分 100%", "100%" in pg.inner_text(".ai-quizbox .ai-score"))
        check("两题判对", pg.evaluate("() => document.querySelectorAll('.ai-q.ok').length") == 2)
        check("判分后显示答案词", pg.evaluate("() => document.querySelectorAll('.ai-q-word').length") == 2)
        check("显示解析", pg.evaluate("() => document.querySelectorAll('.ai-exp').length") == 2)

        rec = pg.evaluate("(id) => TW.store.get(id)", words[0]["id"])
        check("答对写回学习记录", bool(rec) and rec.get("r", 0) >= 2, rec)
        sess = pg.evaluate("() => TW.store.sessions()[0] || null")
        check("记了一条 AI 场次", bool(sess) and sess.get("mode") == "ai" and sess.get("acc") == 100, sess)

        # ---- 4. 复盘（把错题/下一步发回对话）----
        before = pg.evaluate("() => document.querySelectorAll('.ai-row').length")
        pg.click('.ai-quizbox [data-act="review"]')
        pg.wait_for_function("(n) => document.querySelectorAll('.ai-row').length > n + 1", arg=before, timeout=10000)
        check("复盘走对话（多出用户+助手两条）",
              pg.evaluate("() => document.querySelectorAll('.ai-row').length") >= before + 2)

        # ---- 5. 新对话 ----
        pg.click("#ai-new")
        pg.wait_for_timeout(300)
        check("新对话回到欢迎页", pg.evaluate("() => !!document.querySelector('.ai-hero')"))
        check("消息清空", pg.evaluate("() => document.querySelectorAll('.ai-row').length") == 0)

        # ---- 6. 手输 + Enter ----
        pg.click("#ai-input")
        pg.fill("#ai-input", "帮我分析最近的学习情况")
        pg.keyboard.press("Enter")
        pg.wait_for_function("() => document.querySelectorAll('.ai-row.assistant').length > 0", timeout=10000)
        pg.wait_for_timeout(400)
        html = pg.evaluate("() => document.querySelector('.ai-row.assistant .ai-md').innerHTML")
        check("助手回复渲染 markdown", "<b>" in html, html[:100])
        check("列表渲染成 ul", "ai-ul" in html or "<li>" in html, html[:100])
        check("输入框已清空", pg.evaluate("() => document.querySelector('#ai-input').value") == "")
        # 「我最近的学习情况」是自己的数据（system 快照里有），不该触发联网检索
        check("「我最近的学习情况」不触发联网检索", searches == [], searches[:2])

        # ---- 7. 设置页 / 深色 ----
        pg.goto(BASE + "#/settings", wait_until="domcontentloaded")
        pg.wait_for_timeout(500)
        check("设置页有 AI 配置卡", pg.evaluate("() => !!document.querySelector('#ai-prov')"))
        check("设置页显示已配置机型", "DeepSeek" in pg.inner_text(".wrap-narrow"))

        pg.evaluate("() => { TW.store.setSetting('theme','dark'); document.documentElement.classList.add('dark'); }")
        pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
        pg.wait_for_timeout(600)
        check("深色主题下聊天壳正常", pg.evaluate("() => !!document.querySelector('#ai-msgs')"))

        real_err = [e for e in errors if "favicon" not in e.lower()]
        check("无 JS 报错", not real_err, real_err[:3])

        print("\n%d 项检查，失败 %d 项" % (total, len(fails)))
        if fails:
            print("失败项：" + "；".join(fails))
        os._exit(0 if not fails else 1)


if __name__ == "__main__":
    main()
