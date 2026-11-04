# -*- coding: utf-8 -*-
"""题目板块 + AI 右栏（历史对话 / 发布）+ 联网检索 的端到端核验。

对应 sunfleeting 2026-11-04 的三件事：
  A) 把 PDF 里的题目练习导进站点（选词填空 / 段落匹配 / 仔细阅读，解析要完整）
  B) AI 出的题能「发布到题目板块」，右栏里有题目板块入口
  C) AI 对话要能存历史；被问到最新的事要真的去联网搜（而不是回「我无法联网」）

用法（脚本自己拉起静态服务）：
    NODE_OPTIONS= python -u tools/verify_quiz.py
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
PORT = int(os.environ.get("PORT", "5194"))
BASE = "http://127.0.0.1:%d/" % PORT
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

checks = []
errors = []


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


CFG = {
    "provider": "custom",
    "keys": {"custom": "sk-test-abcdef123456"},
    "models": {"custom": "agnes-3.0-flash"},
    "baseUrl": "https://example.invalid/v1",
    "modelLists": {},
}
THREAD = [{
    "id": "t-demo",
    "ts": int(time.time() * 1000) - 7200_000,
    "title": "上周的复习计划",
    "messages": [
        {"role": "user", "content": "上周的复习计划"},
        {"role": "assistant", "content": "**每天 20 个错词**，用看中文拼写模式。"},
    ],
}]


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
            browser = pw.chromium.launch(**({"executable_path": str(EXE)} if EXE.exists() else {}))
            ctx = browser.new_context(viewport={"width": 1280, "height": 950})
            pg = ctx.new_page()
            # 只在**首次**进入时清空题库记录：init script 每次导航都会跑，
            # 无条件 removeItem 会把「刷新后还在不在」这条断言直接测废。
            pg.add_init_script(
                "try{localStorage.setItem('typingcet.guest','1');"
                "if(!sessionStorage.getItem('vq-init')){sessionStorage.setItem('vq-init','1');"
                "localStorage.removeItem('typingcet.quiz.v1');"
                "localStorage.setItem('typingcet.ai.v1', %s);"
                "localStorage.setItem('typingcet.ai.chat.v1', %s);}}catch(e){}"
                % (json.dumps(json.dumps(CFG)), json.dumps(json.dumps(THREAD)))
            )
            pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            pg.goto(BASE + "#/home", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.quiz && TW.data && TW.data.words")
            pg.wait_for_timeout(300)

            # ---------------- A. 题库数据 ----------------
            log("A) 题库：数据完整性")
            data = pg.evaluate("""() => {
                const sets = TW.quiz.bank();
                const out = { n: sets.length, total: 0, bad: [], types: {}, trans: 0 };
                sets.forEach(s => {
                    out.total += s.questions.length;
                    out.types[s.type] = (out.types[s.type] || 0) + 1;
                    if (s.translation) out.trans++;
                    if (s.type === 'cloze') {
                        const body = (s.body || []).join(' ');
                        const blanks = (body.match(/【\\d+】/g) || []).length;
                        if (blanks !== s.questions.length) out.bad.push(s.id + ':空位' + blanks);
                        if ((s.bank || []).length !== 15) out.bad.push(s.id + ':词库' + (s.bank || []).length);
                    }
                    if (s.type === 'match' && (s.paras || []).length < 8) out.bad.push(s.id + ':段落' + (s.paras || []).length);
                    s.questions.forEach(q => {
                        if (!q.answer) out.bad.push(s.id + '#' + q.n + ':无答案');
                        if (!q.explain || q.explain.length < 30) out.bad.push(s.id + '#' + q.n + ':解析不足');
                        if (s.type === 'reading' && q.options.length < 3) out.bad.push(s.id + '#' + q.n + ':选项不足');
                        if (q.options && q.options.length && !q.options.some(o => o.k === q.answer)) {
                            out.bad.push(s.id + '#' + q.n + ':答案不在选项里');
                        }
                    });
                });
                return out;
            }""")
            check("题库 8 组（2 套 Model Test × 4 篇）", data["n"], 8, data["n"])
            check("题目总数 60", data["total"], 60, data["total"])
            check("三种题型都有", data["types"], {"cloze": 2, "match": 2, "reading": 4}, data["types"])
            check("每道题都有答案 + 完整解析，空位/词库/段落数对得上", data["bad"], [], data["bad"][:5])
            check("仔细阅读都带参考译文", data["trans"] >= 4, True, data["trans"])

            # ---------------- B. 做一组选词填空 ----------------
            log("B) 题目板块：选词填空全对流程")
            pg.goto(BASE + "#/quiz", wait_until="domcontentloaded")
            pg.wait_for_selector(".qz-card", timeout=8000)
            check("列表卡片 8 组", pg.locator(".qz-card").count(), 8)
            check("有 Model Test 1 / 2 两个分组", pg.locator(".qz-group-h h3").count(), 3)  # 两个 Model Test + AI 出题

            pg.goto(BASE + "#/quiz?set=mt1-p1", wait_until="domcontentloaded")
            pg.wait_for_selector(".qz-blank", timeout=8000)
            check("正文里 10 个空位", pg.locator(".qz-blank").count(), 10)
            check("词库 15 个词（A~O）", pg.locator(".qz-word").count(), 15)
            check("作答提示里有进度", pg.locator(".qz-progress").count(), 1)

            # 按正确答案逐个填：点空位 → 点对应字母的词
            answers = pg.evaluate("() => TW.quiz.get('mt1-p1').questions.map(q => [q.n, q.answer])")
            for n, letter in answers:
                pg.locator("[data-blank='%d']" % n).click()
                pg.locator(".qz-word[data-word='%s']" % letter).click()
                pg.wait_for_timeout(30)
            check("10 个空都填上了", pg.locator(".qz-blank.filled").count(), 10)
            pg.click("#qz-submit")
            pg.wait_for_timeout(400)
            check("全对 → 10/10", pg.locator(".qz-score b").inner_text(), "10/10")
            check("10 条解析", pg.locator(".qz-qs .qz-q").count(), 10)
            exp_len = pg.evaluate("""() => {
                const el = document.querySelector('.qz-qs .qz-q .qz-exp-t');
                return el ? el.textContent.length : 0;
            }""")
            check("解析是完整长文（>60 字）", exp_len > 60, True, exp_len)
            check("记录写进了本地", pg.evaluate("() => !!TW.quiz.result('mt1-p1')"))

            # 刷新后仍然记得上次成绩
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_selector(".qz-score", timeout=8000)
            check("刷新后保留上次作答", pg.locator(".qz-score b").inner_text(), "10/10")

            # ---------------- C. 仔细阅读 + 段落匹配 ----------------
            log("C) 仔细阅读 / 段落匹配")
            pg.goto(BASE + "#/quiz?set=mt1-p3", wait_until="domcontentloaded")
            pg.wait_for_selector(".qz-opt", timeout=8000)
            check("阅读题 5 道 × 4 选项", (pg.locator(".qz-q").count(), pg.locator(".qz-opt").count()), (5, 20))
            pg.locator(".qz-opt[data-q='21'][data-val='A']").click()
            pg.wait_for_timeout(100)
            pg.click("#qz-submit")
            pg.wait_for_timeout(350)
            check("答错时给出正确答案", pg.locator(".qz-err").count() >= 1)
            check("错题也照样给解析", pg.locator(".qz-exp").count(), 5)
            check("有「看参考译文」按钮", pg.locator("#qz-toggle-tr").count(), 1)
            pg.click("#qz-toggle-tr")
            pg.wait_for_timeout(250)
            check("译文展开", pg.locator(".qz-tr").count(), 1)

            pg.goto(BASE + "#/quiz?set=mt1-p2", wait_until="domcontentloaded")
            pg.wait_for_selector(".qz-paras", timeout=8000)
            check("匹配题 15 段", pg.locator(".qz-paras .qz-p").count(), 15)
            check("匹配题 10 题", pg.locator(".qz-q").count(), 10)
            check("每题 15 个段落字母可选", pg.locator(".qz-q").first.locator(".qz-lt").count(), 15)

            # ---------------- D. AI 出的题发布进来 ----------------
            log("D) AI 出题 → 发布到题目板块")
            pub = pg.evaluate("""() => {
                const rec = TW.quiz.publish({ exercises: [
                    { word: 'abandon', type: 'choice', question: 'They ___ the plan.',
                      options: ['abandoned', 'adopted', 'absorbed', 'abused'],
                      answer: 'abandoned', explanation: 'abandon 放弃、抛弃。' },
                    { word: 'benefit', type: 'spell', question: '好处（n.）', answer: 'benefit',
                      explanation: 'benefit 好处；benefit from 受益。' }
                ], title: '冒烟题组' });
                return { n: rec ? rec.questions.length : 0, ans: rec ? rec.questions.map(q => q.answer) : [] };
            }""")
            check("发布 2 道题", pub["n"], 2, pub)
            check("选择题答案被规范成字母", pub["ans"][0], "A", pub["ans"])
            check("拼写题答案保留单词", pub["ans"][1], "benefit", pub["ans"])

            pg.goto(BASE + "#/quiz", wait_until="domcontentloaded")
            pg.wait_for_selector(".qz-card", timeout=8000)
            check("列表里出现 AI 组（8+1）", pg.locator(".qz-card").count(), 9)
            check("AI 组的卡片在「AI 出题」分组下",
                  pg.locator(".qz-group").last.locator(".qz-card").count(), 1)
            pg.locator(".qz-group").last.locator(".qz-card").first.click()
            pg.wait_for_selector(".qz-input", timeout=8000)
            check("AI 组的拼写题是输入框", pg.locator(".qz-input").count(), 1)
            pg.fill(".qz-input", "benefit")
            pg.locator(".qz-opt").first.click()
            pg.click("#qz-submit")
            pg.wait_for_timeout(350)
            check("AI 题也能判分", pg.locator(".qz-score b").inner_text(), "2/2")

            # ---------------- E. AI 右栏：历史对话 / 题目板块 ----------------
            log("E) AI 页右栏")
            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.wait_for_selector("#ai-rail", timeout=8000)
            check("右栏存在", pg.locator("#ai-rail").count(), 1)
            check("右栏读到注入的历史对话", pg.locator("#ai-rail .ai-th").count(), 1)
            check("右栏有「题目板块」区块", pg.locator(".ai-rail-sec").count(), 2)
            n_all = pg.evaluate("() => TW.quiz.all().length")
            check("题目板块显示题库组数",
                  ("题库 %d 组" % n_all) in pg.locator(".ai-rail-stat").inner_text(), True,
                  pg.locator(".ai-rail-stat").inner_text())

            pg.locator("#ai-rail .ai-th").first.click()
            pg.wait_for_timeout(400)
            check("点历史 → 回放两条消息", pg.locator(".ai-bubble").count(), 2)

            pg.click("#ai-hist-btn")
            pg.wait_for_timeout(250)
            check("顶栏「历史」打开面板", pg.locator("#ai-hist").count(), 1)
            pg.click("#ai-hist-close")
            pg.wait_for_timeout(250)
            check("面板能关掉", pg.locator("#ai-hist").count(), 0)

            # 删除会话（goto 到同一个 hash 不一定真重载，这里显式 reload）
            left = pg.evaluate("() => { TW.ai.removeThread('t-demo'); return TW.ai.listThreads().length; }")
            check("删除后本地只剩 0 条", left, 0, left)
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            check("删掉后右栏为空", pg.locator("#ai-rail .ai-th").count(), 0)
            check("空态有说明", pg.locator(".ai-th-empty").count(), 1)

            # ---------------- F. 联网检索 ----------------
            log("F) 联网检索（接口用假响应拦截，不真联网）")
            hit = pg.evaluate("""() => {
                const yes = ['2026 年六级什么时候考', '最近六级有什么新政策', '四六级报名时间',
                             '最新真题下载', 'CET 官网在哪'];
                const no = ['帮我分析错词', '来一组练习', '继续', '讲讲 abandon 这个词',
                            '帮我分析最近的学习情况', '我最近错得最多的词是什么', '我的复习进度怎么样'];
                return [yes.map(t => TW.ai.needsWeb(t)), no.map(t => TW.ai.needsWeb(t))];
            }""")
            check("时间敏感/最新类问题会触发检索", hit[0][:5], [True] * 5, hit[0])
            check("普通学习问题不触发检索", hit[1][:4], [False] * 4, hit[1])
            # 「我最近……学习/错词/进度」是自己的数据，system 快照里已有，搜了纯浪费
            check("「我最近的学习情况」类问题不触发检索", hit[1][4:7], [False] * 3, hit[1])

            # mock 掉 /api/ai/search
            def fake_search(route):
                route.fulfill(status=200, content_type="application/json", body=json.dumps({
                    "results": [
                        {"title": "2026 年下半年 CET 报名启动", "url": "https://cet.neea.edu.cn/a.htm",
                         "snippet": "笔试将于 12 月 12 日举行。", "host": "cet.neea.edu.cn"},
                        {"title": "四六级考试时间安排", "url": "https://example.com/b", "snippet": "口试 11 月 21-22 日。",
                         "host": "example.com"},
                    ], "engine": "bing", "q": "六级什么时候考"
                }))
            pg.route("**/api/ai/search", fake_search)
            res = pg.evaluate("""async () => {
                const pack = await TW.ai.searchWeb('2026 年六级什么时候考');
                return { n: pack.results.length, brief: TW.ai.searchBrief(pack) };
            }""")
            check("检索拿到 2 条结果", res["n"], 2, res["n"])
            check("结果被压进 system 文本（带来源域名）",
                  "cet.neea.edu.cn" in res["brief"] and "12 月 12 日" in res["brief"], True,
                  res["brief"][:120])
            empty = pg.evaluate("() => TW.ai.searchBrief({ results: [] })")
            check("没有结果时不给空段落", empty, "")

            # 系统提示词里必须有「不许说无法联网」的约束
            sys_txt = pg.evaluate("""() => {
                // 从视图模块外部拿不到 SYSTEM，这里改为检查源码里有没有那句约束
                return fetch('assets/js/views/ai.js').then(r => r.text());
            }""")
            check("system 里有「不要说无法联网」的硬约束",
                  "绝对不要说「我无法联网」" in sys_txt, True)
            check("system 要求标注来源域名", "句末标一个来源域名" in sys_txt, True)

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
    # 收尾别等浏览器优雅退出（headless shell 有时挂住）
    os._exit(code)
