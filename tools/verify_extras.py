# -*- coding: utf-8 -*-
"""2026-11-05 这一轮的四件事的端到端核验：

  A) 题库扩容   —— data/quiz-more.js 与 data/quiz.js 合并，结构完整（真题 1 套 + 模拟 4 套）
  B) 听力板块   —— 列表 / 播放条 / 四选一 / 交卷判分 / 解析 / 原文 + 译文 / 记录落盘
  C) 单词页 AI  —— 详解页的「AI 讲解」面板（mock 流式），没 Key 时引导去配
  D) AI 快照    —— 写作草稿与批改记录进入 briefText（修「AI 看不到我写的翻译」），且不夹带 Key

用法（脚本自己拉起静态服务）：NODE_OPTIONS= python -u tools/verify_extras.py
"""
import json
import os
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "5193"))
BASE = "http://127.0.0.1:%d/" % PORT
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

checks = []
errors = []

CFG = {
    "provider": "custom",
    "keys": {"custom": "sk-test-abcdef123456"},
    "models": {"custom": "agnes-3.0-flash"},
    "baseUrl": "https://example.invalid/v1",
    "modelLists": {},
}

DRAFT = ("China's high-speed railway has developed very fast. By the end of 2024, the mileage "
         "in operation had exceeded 48,000 kilometres, more than two thirds of the world total.")
BRIEF_AI = ("**本质**：这个词强调「过程」而不是「结果」。\n\n"
            "**搭配**：`pursue a goal` 追求目标；`pursue a career` 从事某职业\n\n"
            "**易混**：`pursue`（长期追求）vs `chase`（追着跑，更具体）\n\n"
            "例句：She decided to pursue a career in medicine after volunteering at a clinic.（她在一家诊所做义工后决定从医。）")


def log(m):
    print(m, flush=True)


def check(name, got, want=True, extra=""):
    ok = got == want
    checks.append((ok, name))
    log(("  [OK]   " if ok else "  [FAIL] ") + name
        + (("  " + str(extra)) if extra else "")
        + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def port_free(p):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", p)) != 0
    finally:
        s.close()


def wait_http(url, timeout=25):
    import urllib.request
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                return r.status
        except Exception:
            time.sleep(0.25)
    return None


def sse(text):
    parts = [text[:30], text[30:110], text[110:]]
    chunks = []
    for p in parts:
        if p:
            chunks.append("data: " + json.dumps({"choices": [{"delta": {"content": p}}]},
                                                ensure_ascii=False) + "\n\n")
    chunks.append("data: [DONE]\n\n")
    return "".join(chunks)


INIT = """
try{
  localStorage.setItem('typingcet.guest','1');
  if(!sessionStorage.getItem('vx-init')){
    sessionStorage.setItem('vx-init','1');
    localStorage.removeItem('typingcet.listen.v1');
    localStorage.removeItem('typingcet.quiz.v1');
    localStorage.setItem('typingcet.write.v1', %s);
  }
}catch(e){}
"""

WRITE_SEED = {
    "drafts": {"tr-highspeed": DRAFT},
    "results": {
        "tr-tea": {
            "ts": int(time.time() * 1000) - 3600_000,
            "score": 12, "max": 15,
            "text": "Tea is the most common drink in Chinese daily life and has a history of four thousand years.",
            "data": {
                "comment": "意思完整，句式偏简单。",
                "issues": [{"quote": "has a history of", "fix": "dates back", "why": "更书面"}],
            },
        }
    },
}


def main():
    if not port_free(PORT):
        log("端口 %d 被占用，先换一个 PORT" % PORT)
        return 3

    procs = [subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=str(ROOT),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    try:
        if wait_http(BASE + "index.html") != 200:
            log("静态服务未就绪")
            return 3

        with sync_playwright() as pw:
            kw = {}
            if EXE.exists():
                kw["executable_path"] = str(EXE)
            browser = pw.chromium.launch(**kw)
            ctx = browser.new_context(viewport={"width": 1280, "height": 950},
                                      permissions=["clipboard-read", "clipboard-write"])
            pg = ctx.new_page()
            pg.add_init_script(INIT % json.dumps(json.dumps(WRITE_SEED, ensure_ascii=False)))
            IGNORE = ("ERR_CONNECTION_CLOSED", "ERR_NAME_NOT_RESOLVED", "example.invalid")

            def on_console(m):
                if m.type == "error" and not any(k in m.text for k in IGNORE):
                    errors.append("console:" + m.text)

            pg.on("console", on_console)
            pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            seen = {"n": 0, "system": "", "user": ""}
            sse_body = {"v": BRIEF_AI}      # 不同用例换不同回复体（见 E 段）

            def chat_route(route):
                body = json.loads(route.request.post_data or "{}")
                seen["n"] += 1
                seen["system"] = body.get("system", "")
                for m in reversed(body.get("messages") or []):
                    if m.get("role") == "user":
                        seen["user"] = m.get("content", "")
                        break
                route.fulfill(status=200, content_type="text/event-stream",
                              headers={"Access-Control-Allow-Origin": "*"}, body=sse(sse_body["v"]))

            ctx.route("**/api/ai/chat", chat_route)

            pg.goto(BASE + "#/quiz", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.quiz && TW.quiz.bank")
            pg.wait_for_timeout(300)

            # ---------------- A. 题库扩容 ----------------
            log("A) 题库扩容（真题 + 模拟题）")
            d = pg.evaluate("""() => {
                const sets = TW.quiz.bank();
                const out = { n: sets.length, total: 0, byType: {}, bad: [], groups: [], more: 0 };
                sets.forEach(s => {
                    out.total += s.questions.length;
                    out.byType[s.type] = (out.byType[s.type] || 0) + 1;
                    if (out.groups.indexOf(s.test) < 0) out.groups.push(s.test);
                    if (String(s.id).indexOf('z') === 0 || String(s.id).indexOf('sim') === 0) out.more++;
                    if (!s.title) out.bad.push(s.id + ':无标题');
                    const isNew = /^(z|sim)/.test(String(s.id));
                    if (isNew && !s.translation) out.bad.push(s.id + ':无译文');
                    if (s.type === 'cloze') {
                        const body = (s.body || []).join(' ');
                        const blanks = (body.match(/【\\d+】/g) || []).length;
                        if (blanks !== s.questions.length) out.bad.push(s.id + ':空位' + blanks);
                        if ((s.bank || []).length !== 15) out.bad.push(s.id + ':词库' + (s.bank || []).length);
                    }
                    if (s.type === 'match' && (s.paras || []).length < 8) out.bad.push(s.id + ':段落' + (s.paras || []).length);
                    s.questions.forEach(q => {
                        if (!q.answer) out.bad.push(s.id + '#' + q.n + ':无答案');
                        if (!q.explain || q.explain.length < 20) out.bad.push(s.id + '#' + q.n + ':解析不足');
                        if (s.type === 'reading' && isNew) {
                            if (!q.options || q.options.length !== 4) out.bad.push(s.id + '#' + q.n + ':不是四选一');
                            else if (!q.options.some(o => o.k === q.answer)) out.bad.push(s.id + '#' + q.n + ':答案不在选项');
                        }
                        if (s.type === 'match' && !(s.paras || []).some(p => p.k === q.answer)) {
                            out.bad.push(s.id + '#' + q.n + ':答案段不存在');
                        }
                    });
                });
                return out;
            }""")
            check("题库 13 组（扫描件 8 + 新增 5）", d["n"], 13, d["n"])
            check("新增 5 组被合并进来", d["more"], 5, d["more"])
            check("题目总数 >= 95", d["total"] >= 95, True, d["total"])
            check("新增 5 组结构完整（译文/四选一/答案在选项内）", d["bad"], [], d["bad"][:5])
            check("四种题型齐（cloze/match/reading）",
                  all(k in d["byType"] for k in ("cloze", "match", "reading")), True, d["byType"])
            groups = d["groups"]
            check("列表按来源分组出现「2024年12月真题（卷二）」",
                  "2024年12月真题（卷二）" in groups, True, groups[:6])
            check("列表出现「模拟题 · 第9组」", "模拟题 · 第9组" in groups, True, groups[:6])

            # ---------------- B. 听力 ----------------
            log("B) 听力板块")
            pg.goto(BASE + "#/listening", wait_until="domcontentloaded")
            pg.wait_for_selector(".ls-card", timeout=8000)
            check("听力列表 3 套", pg.eval_on_selector_all(".ls-card", "e => e.length"), 3)
            check("列表有 KPI", pg.eval_on_selector_all(".stat-card", "e => e.length"), 4)

            ld = pg.evaluate("""() => {
                const s = (window.TW_LISTENING || {}).sets || [];
                const out = { n: s.length, q: 0, bad: [], kinds: [] };
                s.forEach(set => {
                    if (out.kinds.indexOf(set.kind) < 0) out.kinds.push(set.kind);
                    (set.segments || []).forEach(seg => {
                        out.q += seg.questions.length;
                        if (!seg.transcript || !seg.transcript.length) out.bad.push(set.id + ':无原文');
                        if (!seg.translation) out.bad.push(set.id + ':无译文');
                        seg.questions.forEach(q => {
                            if (!q.explain || q.explain.length < 20) out.bad.push(set.id + '#' + q.n + ':解析不足');
                            if (!q.options || q.options.length !== 4) out.bad.push(set.id + '#' + q.n + ':不是四选一');
                            else if (!q.options.some(o => o.k === q.answer)) out.bad.push(set.id + '#' + q.n + ':答案不在选项');
                        });
                    });
                });
                return out;
            }""")
            check("听力题 16 道（新闻 6 + 长对话 4 + 讲座 6）", ld["q"], 16, ld["q"])
            check("新闻/长对话/讲座三种都有",
                  sorted(ld["kinds"]), ["conv", "lecture", "news"])
            check("每段都有原文 + 译文，每题有解析和四选一", ld["bad"], [], ld["bad"][:5])

            pg.click(".ls-card >> nth=0")
            pg.wait_for_selector("#ls-input" if False else "#ls-play", timeout=8000)
            pg.wait_for_timeout(200)
            check("做题页有播放条", pg.eval_on_selector_all("#ls-play", "e => e.length"), 1)
            check("有语速切换 3 档", pg.eval_on_selector_all("[data-rate]", "e => e.length"), 3)
            check("有「播放这一段」按钮（分段重播）",
                  pg.eval_on_selector_all("[data-play]", "e => e.length"), 3)
            check("题目渲染出来（新闻套 6 题）",
                  pg.eval_on_selector_all(".ls-q", "e => e.length"), 6)

            # 作答：第一题选对，第二题选错，其余不答
            qs = pg.evaluate("""() => {
                const set = TW_LISTENING.sets[0];
                return set.segments.flatMap(s => s.questions.map(q => ({k: s.id + '-' + q.n, a: q.answer})));
            }""")
            pg.click('.ls-opt[data-q="%s"][data-k="%s"]' % (qs[0]["k"], qs[0]["a"]))
            pg.wait_for_timeout(150)
            wrong = "A" if qs[1]["a"] != "A" else "B"
            pg.click('.ls-opt[data-q="%s"][data-k="%s"]' % (qs[1]["k"], wrong))
            pg.wait_for_timeout(150)
            check("选项可点、选中态生效",
                  pg.eval_on_selector_all(".ls-opt.sel", "e => e.length"), 2)
            check("交卷按钮显示已答进度", "已答 2/6" in pg.inner_text("#ls-submit"), True,
                  pg.inner_text("#ls-submit").strip())

            pg.on("dialog", lambda dlg: dlg.accept())
            pg.click("#ls-submit")
            pg.wait_for_timeout(400)
            check("交卷后出现得分", "得分 1 / 6" in pg.inner_text(".ls-score"), True,
                  pg.inner_text(".ls-score"))
            check("每题都有解析", pg.eval_on_selector_all(".ls-exp", "e => e.length"), 6)
            check("答错那题标出你选的与正确答案",
                  "你选了" in pg.inner_text(".ls-exp >> nth=1"), True)
            check("选项交卷后锁定",
                  pg.eval_on_selector_all(".ls-opt[disabled]", "e => e.length >= 24"), True)
            rec = pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.listen.v1')||'{}')")
            check("记录落独立键 typingcet.listen.v1",
                  ((rec.get("results") or {}).get("ls-news-tech") or {}).get("right"), 1)

            pg.click("#ls-text")
            pg.wait_for_timeout(250)
            txt = pg.inner_text(".ls-texts")
            check("「看原文」展开三个 segment 的原文",
                  pg.eval_on_selector_all(".ls-txt", "e => e.length"), 3)
            check("原文内容对得上（英文字幕）", "exam results" in txt, True, txt[:60])
            pg.click("#ls-trans")
            pg.wait_for_timeout(250)
            check("「看原文 + 译文」出现中文",
                  "考试成绩" in pg.inner_text(".ls-texts"), True)

            pg.goto(BASE + "#/listening", wait_until="domcontentloaded")
            pg.wait_for_timeout(350)
            check("列表回显上次成绩", "上次 1/6" in pg.inner_text(".ls-card >> nth=0"), True,
                  pg.inner_text(".ls-card >> nth=0")[:50])

            # ---------------- C. 单词页 AI 讲解 ----------------
            log("C) 单词详解页的 AI 讲解")
            pg.evaluate("(cfg) => localStorage.setItem('typingcet.ai.v1', cfg)", json.dumps(CFG))
            pg.goto(BASE + "#/word?id=0", wait_until="domcontentloaded")
            pg.wait_for_timeout(600)
            wid = str(pg.evaluate("() => (window.TW && TW.WORDS && TW.WORDS[0] && TW.WORDS[0].id) || ''") or '')
            check("找得到一个有词典卡的词", bool(wid), True, wid)
            pg.goto(BASE + "#/word?id=" + str(wid), wait_until="domcontentloaded")
            pg.wait_for_timeout(600)
            check("详解页有 AI 讲解面板", pg.eval_on_selector_all("#dc-ai", "e => e.length"), 1)
            check("面板默认是提示文案", "点右上按钮" in pg.inner_text("#dc-ai-body"), True)
            check("有「让 AI 讲这个词」按钮", "让 AI 讲" in pg.inner_text("#dc-ai-go"), True)

            n0 = seen["n"]
            pg.click("#dc-ai-go")
            pg.wait_for_function("() => document.querySelector('#dc-ai-body b, #dc-ai-body strong')", timeout=15000)
            pg.wait_for_timeout(200)
            check("点一次只发一次请求", seen["n"] - n0, 1)
            check("system 写明「六级词汇教练」", "六级词汇教练" in seen["system"], True)
            check("user 里带了单词本身", "account" in seen["user"].lower(), True,
                  seen["user"][:60])
            body = pg.inner_text("#dc-ai-body")
            check("讲解放进面板（本质/搭配/易混/例句）",
                  "本质" in body and "搭配" in body and "易混" in body and "例句" in body, True,
                  body[:60])
            check("Markdown 渲染成粗体（不是裸星号）",
                  pg.eval_on_selector_all("#dc-ai-body b, #dc-ai-body strong", "e => e.length") >= 2, True)
            check("代码/搭配用 code 渲染",
                  pg.eval_on_selector_all("#dc-ai-body code", "e => e.length") >= 1, True)
            check("按钮变成「重新生成」", pg.inner_text("#dc-ai-go"), "重新生成")

            # 没 Key 时引导去配
            pg.evaluate("() => localStorage.removeItem('typingcet.ai.v1')")
            # 🔴 goto 到「完全相同的 URL」Chromium 不重新加载，TW.ai 内存里还是旧配置；
            # 要清掉 Key 必须显式 reload()
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_timeout(500)
            pg.click("#dc-ai-go")
            pg.wait_for_timeout(400)
            check("没 Key 时提示去配并把页面送到 AI 页",
                  "还没配置 AI Key" in pg.inner_text("body") and "ai" in pg.evaluate("() => location.hash"),
                  True, pg.evaluate("() => location.hash"))

            # ---------------- D. AI 快照能看到写作 ----------------
            log("D) AI 快照：能看到写作草稿与批改记录")
            pg.evaluate("(cfg) => localStorage.setItem('typingcet.ai.v1', cfg)", json.dumps(CFG))
            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.wait_for_timeout(500)
            brief = pg.evaluate("() => TW.ai.briefText()")
            check("快照里有「写作草稿」段", "写作草稿" in brief, True, brief[:40])
            check("快照里带上了草稿原文", "high-speed railway has developed" in brief, True)
            check("快照里有已批改的写作（分数 + 意见）",
                  "写作·最近批改" in brief and "12/15" in brief, True)
            check("快照里带上了批改问题（原文→改法）",
                  "has a history of → dates back" in brief, True)
            check("快照不含 AI Key（私人信息不外带）", "sk-test" not in brief, True)
            check("快照不含邮箱/密码类字段",
                  ("password" not in brief.lower() and "@qq.com" not in brief), True)

            # ---------------- E. 题库真的进了 prompt ----------------
            # 2026-11-05 修：「AI 说看不到我的 Model Test 1，为什么不可以生成题目」
            # 根因是 prompt 里只有做题记录、没有题库内容。E 段专门守住这条。
            log("E) 题库进 prompt：索引常驻 + 原文按需注入")
            idx = pg.evaluate("() => TW.ai.quizIndex()")
            check("题库索引 13 行", len(idx), 13, len(idx))
            check("索引里出现分组「Model Test 1」", any("Model Test 1" in x for x in idx), True)
            check("索引里出现「模拟题 · 第9组」", any("模拟题 · 第9组" in x for x in idx), True)
            check("索引里带题型与题数", any("仔细阅读" in x and "题" in x for x in idx), True,
                  idx[0])

            ctx = pg.evaluate("() => TW.ai.quizContext('Model Test 1 里第一篇阅读第 51 题为什么选 A')")
            check("「Model Test 1 第一篇阅读」收窄到 mt1-p3 一套",
                  ("mt1-p3" in ctx) and ("mt1-p1" not in ctx) and ("mt1-p4" not in ctx), True,
                  ctx[:60])
            ctx1 = pg.evaluate("() => TW.ai.quizContext('Model Test 1 这套题怎么样')")
            check("只报分组「Model Test 1」时 4 套都给概况",
                  all(k in ctx1 for k in ("mt1-p1", "mt1-p2", "mt1-p3", "mt1-p4")), True, ctx1[:60])
            check("组级提问用概况、不贴全文（省上下文）",
                  ("概况" in ctx1) and ("✔ 答案" not in ctx1) and len(ctx1) < 6000, True,
                  len(ctx1))
            check("注入内容含原文正文", "Stockholm" in ctx, True)
            check("注入内容含答案与解析", "✔ 答案" in ctx and "解析：" in ctx, True)

            ctx2 = pg.evaluate("() => TW.ai.quizContext('模拟题第10组那篇完形第 3 空选什么')")
            check("「模拟题第10组…完形」精确命中 cloze 一套",
                  ("sim-cloze-crops" in ctx2) and ("sim-match-city" not in ctx2), True, ctx2[:60])
            ctx3 = pg.evaluate("() => TW.ai.quizContext('我这套阅读第 52 题')")
            check("只提「阅读」时给候选清单（含阅读套，不含完形）",
                  ("mt1-p3" in ctx3 and "z202412-p2" in ctx3 and "sim-cloze-crops" not in ctx3),
                  True, ctx3[:60])
            check("候选清单不贴原文（篇幅可控）",
                  "✔ 答案" not in ctx3 and len(ctx3) < 1200, True, len(ctx3))
            check("闲聊「我阅读总是错很多」不塞原文",
                  pg.evaluate("() => TW.ai.quizContext('我阅读总是错很多，怎么办')"), "")

            # 真发一条：system 里必须同时有索引和原文
            # 🔴 上一段把 Key 删过，页面还停在配置卡（S.entered=false）；同 URL 的 goto 不重载，必须 reload
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_selector("#ai-input", timeout=15000)
            n1 = seen["n"]
            pg.click("#ai-input")
            pg.fill("#ai-input", "Model Test 1 的第一篇阅读第 51 题为什么选 A？")
            pg.keyboard.press("Enter")
            end = time.time() + 20
            while time.time() < end and seen["n"] <= n1:
                pg.wait_for_timeout(200)
            check("消息真的发出去了（拦到 1 次请求）", seen["n"] - n1, 1)
            pg.wait_for_timeout(500)
            sysline = seen["system"]
            check("请求 system 里有题库索引", "【题目板块 · 题库索引】" in sysline, True)
            check("请求 system 里有该套原文", "mt1-p3" in sysline and "✔ 答案" in sysline, True)
            check("system 明令禁止「无法访问题库」这种话",
                  "无法访问或生成该特定题库" in sysline, True)

            # 通用选择题（word/id 为空）要能成卡、能判分，且不写单词记录
            sse_body["v"] = ("这套阅读题我照着真题出的。\n\n"
                             '```quiz\n{"exercises":[{"id":"","word":"","type":"choice",'
                             '"question":"According to paragraph 2, what did the study find?",'
                             '"options":["People agree more on natural objects",'
                             '"People never agree on anything",'
                             '"Art is judged the same everywhere",'
                             '"Only architects share taste"],'
                             '"answer":"A","explanation":"第二段：自然物一致性最高，人工制品分歧大。"}]}\n```')
            before = pg.evaluate("() => Object.keys(TW.store.state.progress).length")
            n2 = seen["n"]
            pg.click("#ai-input")
            pg.fill("#ai-input", "照这篇给我出 1 道仿真阅读题")
            pg.keyboard.press("Enter")
            end = time.time() + 20
            while time.time() < end and seen["n"] <= n2:
                pg.wait_for_timeout(200)
            pg.wait_for_selector(".ai-quizbox", timeout=20000)
            pg.wait_for_timeout(200)
            check("不带单词的四选一也渲染成题卡",
                  pg.eval_on_selector_all(".ai-q", "e => e.length"), 1)
            check("题卡不显示单词标签",
                  pg.eval_on_selector_all(".ai-q-word", "e => e.length"), 0)
            check("提示写明「只判分、不计入单词记录」",
                  "只判分" in pg.inner_text(".ai-quizbox-f"), True,
                  pg.inner_text(".ai-quizbox-f"))
            pg.click('.ai-opt[data-i="0"] >> nth=0')
            pg.wait_for_timeout(120)
            pg.click('.ai-quizbox-f button[data-act="grade"]')
            pg.wait_for_timeout(400)
            check("判分正确（答对 1/1）", "答对 1" in pg.inner_text(".ai-quizbox-h"), True,
                  pg.inner_text(".ai-quizbox-h"))
            check("通用题不写回单词进度",
                  pg.evaluate("() => Object.keys(TW.store.state.progress).length"), before)

            check("无 JS 报错", len(errors) == 0, extra=errors[:3])
            browser.close()
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass

    ok = sum(1 for c in checks if c[0])
    log("\n通过 %d / 共 %d 项断言" % (ok, len(checks)))
    if ok != len(checks):
        log("失败项：")
        for o, n in checks:
            if not o:
                log("  - " + n)
    return 0 if ok == len(checks) else 1


if __name__ == "__main__":
    code = main()
    os._exit(code)
