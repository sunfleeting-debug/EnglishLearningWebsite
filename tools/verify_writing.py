# -*- coding: utf-8 -*-
"""写作板块（翻译 / 作文 + AI 批改）端到端核验。

对应 sunfleeting 2026-11-04：「还有翻译和作文……因为翻译和作文没有唯一答案，
让 AI 对这个翻译答案进行打分，给出网上的标注答案，和 AI 生成的三个候选答案」。

分六段：
  A) 数据层      —— 11 题（5 翻译 + 6 作文），每题都有题目/要求/参考答案/写作要点
  B) 列表页      —— 卡片数、分类、KPI、点进做题页
  C) 作答与离线  —— 字数统计、草稿落盘（独立键）、要点/参考展开、清空
  D) AI 批改     —— mock SSE，验证流式 → ```grade 解析 → 分数/分项/问题/改写/三候选
  E) 结果留存    —— 刷新后还在、列表卡片显示上次分数、切候选版本
  F) 无 Key 时   —— 按钮文案、点批改引导去配 Key、参考译文仍可看

用法（脚本自己拉起静态服务）：
    NODE_OPTIONS= python -u tools/verify_writing.py
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
PORT = int(os.environ.get("PORT", "5196"))
BASE = "http://127.0.0.1:%d/" % PORT
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

checks = []
errors = []

# 一份「像样」的批改回包：分数 + 3 个分项 + 2 条问题 + 改写 + 3 个候选
GRADE = {
    "score": 11,
    "max": 15,
    "rubric": [
        {"name": "准确", "score": 4, "max": 5},
        {"name": "通顺", "score": 4, "max": 5},
        {"name": "用词", "score": 3, "max": 5},
    ],
    "comment": "整体意思到位，个别搭配偏中式，句式也偏单调。",
    "issues": [
        {"quote": "has become increasingly popular among",
         "fix": "has gained growing popularity among",
         "why": "后者更书面，六级作文常用。"},
        {"quote": "a lot of students",
         "fix": "a large number of students",
         "why": "口语化表达，议论文里应避免。"},
    ],
    "rewrite": "With the rapid development of the Internet, online learning has gained growing popularity among college students in China.",
    "samples": [
        {"style": "稳妥版", "text": "Online learning is now popular with many college students in China."},
        {"style": "进阶版", "text": "Thanks to the Internet, online learning has won wide acceptance among Chinese college students."},
        {"style": "高分版", "text": "The Internet has turned online learning into a routine part of college life in China, a shift that few students could now imagine reversing."},
    ],
}
ANSWER = ("With the rapid development of the internet, online learning has become increasingly "
          "popular among college students in China, and a lot of students now prefer it.")


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
    """整段文本包成 OpenAI 风格 SSE（切 3 段，验证增量拼接不丢字）"""
    parts = [text[:40], text[40:120], text[120:]] if len(text) > 120 else [text]
    chunks = []
    for p in parts:
        if not p:
            continue
        chunks.append("data: " + json.dumps({"choices": [{"delta": {"content": p}}]},
                                            ensure_ascii=False) + "\n\n")
    chunks.append("data: [DONE]\n\n")
    return "".join(chunks)


CFG = {
    "provider": "custom",
    "keys": {"custom": "sk-test-abcdef123456"},
    "models": {"custom": "agnes-3.0-flash"},
    "baseUrl": "https://example.invalid/v1",
    "modelLists": {},
}

INIT = """
try{
  localStorage.setItem('typingcet.guest','1');
  if(!sessionStorage.getItem('vw-init')){
    sessionStorage.setItem('vw-init','1');
    localStorage.removeItem('typingcet.write.v1');
    localStorage.removeItem('typingcet.ai.v1');
  }
}catch(e){}
"""


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
            ctx = browser.new_context(viewport={"width": 1280, "height": 950})
            pg = ctx.new_page()
            pg.add_init_script(INIT)
            # mock 的 baseUrl 是 example.invalid：前端「浏览器直连优先」会先撞一次 DNS
            # 失败再退 Worker，这条 ERR_CONNECTION_CLOSED 是测试环境的正常噪音
            IGNORE = ("ERR_CONNECTION_CLOSED", "ERR_NAME_NOT_RESOLVED", "example.invalid")

            def on_console(m):
                if m.type == "error" and not any(k in m.text for k in IGNORE):
                    errors.append("console:" + m.text)

            pg.on("console", on_console)
            pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            # 批改请求打到 mock；顺带记下 system/user，便于检查协议
            seen = {"n": 0, "system": "", "user": ""}

            def chat_route(route):
                body = json.loads(route.request.post_data or "{}")
                seen["n"] += 1
                seen["system"] = body.get("system", "")
                for m in reversed(body.get("messages") or []):
                    if m.get("role") == "user":
                        seen["user"] = m.get("content", "")
                        break
                text = ("总评：意思到位，搭配有两处偏中式。\n\n"
                        "1. 用词更书面一些；\n2. 句式别全是主谓宾。\n\n"
                        "```grade\n" + json.dumps(GRADE, ensure_ascii=False) + "\n```")
                route.fulfill(status=200, content_type="text/event-stream",
                              headers={"Access-Control-Allow-Origin": "*",
                                       "Cache-Control": "no-cache"},
                              body=sse(text))

            pg.route("**/api/ai/chat", chat_route)

            pg.goto(BASE + "#/writing", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.views && TW.views.writing")
            pg.wait_for_timeout(300)

            # ---------------- A. 数据 ----------------
            log("A) 数据层：题目完整性")
            data = pg.evaluate("""() => {
                const items = (window.TW_WRITING && TW_WRITING.items) || [];
                const out = { n: items.length, trans: 0, essay: 0, bad: [], ids: [] };
                items.forEach(it => {
                    out.ids.push(it.id);
                    if (it.type === 'trans') out.trans++; else out.essay++;
                    if (!it.title || it.title.length < 2) out.bad.push(it.id + ':无标题');
                    if (!it.prompt || it.prompt.length < 8) out.bad.push(it.id + ':题面太短');
                    if (!it.require || it.require.length < 15) out.bad.push(it.id + ':要求太短');
                    const wc = (String(it.sample||'').match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
                    if (wc < 40) out.bad.push(it.id + ':参考' + wc + '词');
                    if (!Array.isArray(it.tips) || it.tips.length < 2) out.bad.push(it.id + ':要点不足');
                    if (!it.minutes) out.bad.push(it.id + ':无时长');
                    // 翻译题面必须是中文源文（够长才够练）；作文题面是英文标题，要求里给字数指令
                    const cn = (String(it.prompt).match(/[\\u4e00-\\u9fa5]/g) || []).length;
                    if (it.type === 'trans' && cn < 80) out.bad.push(it.id + ':中文源文过短' + cn);
                    if (it.type === 'essay' && cn > 0) out.bad.push(it.id + ':作文题面混了中文');
                    if (it.type === 'essay' && !/word/i.test(it.require)) out.bad.push(it.id + ':要求没写字数');
                });
                out.dup = out.ids.length !== new Set(out.ids).size;
                return out;
            }""")
            check("题目 11 道", data["n"], 11, data["n"])
            check("5 翻译 + 6 作文", [data["trans"], data["essay"]], [5, 6])
            check("id 不重复", data["dup"], False)
            check("每题都有标题/题面/要求/参考/要点/时长", data["bad"], [], data["bad"][:5])
            check("翻译题面都是够长的中文源文，作文题面是英文标题", data["trans"] >= 5 and data["essay"] >= 5,
                  True, "%d/%d" % (data["trans"], data["essay"]))

            # ---------------- B. 列表页 ----------------
            log("B) 列表页")
            check("卡片 11 张", pg.eval_on_selector_all(".wr-card", "els => els.length"), 11)
            check("两个分组", pg.eval_on_selector_all(".wr-group", "els => els.length"), 2)
            check("KPI 4 张", pg.eval_on_selector_all(".stat-card", "els => els.length"), 4)
            check("空状态不出现", pg.eval_on_selector_all(".wr-cards:empty", "els => els.length"), 0)
            # 卡片可点 → 做题页
            pg.click(".wr-card >> nth=0")
            pg.wait_for_function("() => /#\\/writing\\?id=/.test(location.hash)")
            pg.wait_for_timeout(250)
            first_id = pg.evaluate("() => location.hash.split('id=')[1]")
            check("点卡片进做题页", first_id, "tr-highspeed", first_id)
            check("做题页有题面", pg.eval_on_selector_all(".wr-text", "els => els.length"), 1)
            check("做题页有文本域", pg.eval_on_selector_all("#wr-input", "els => els.length"), 1)

            # ---------------- C. 作答 / 离线能力 ----------------
            log("C) 作答与离线能力")
            pg.fill("#wr-input", "hello world")
            pg.wait_for_timeout(120)
            check("字数实时统计", pg.inner_text("#wr-wc"), "2")
            saved = pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.write.v1')||'{}')")
            check("草稿落独立键 typingcet.write.v1",
                  (saved.get("drafts") or {}).get("tr-highspeed"), "hello world")
            check("草稿不进 store.state（不污染云同步/导出）",
                  pg.evaluate("() => JSON.stringify(TW.store.state).indexOf('hello world')"), -1)

            # 参考译文（离线可用）
            pg.click("#wr-ref")
            pg.wait_for_timeout(200)
            ref = pg.inner_text(".wr-sample-ref")
            check("「看参考译文」能展开", "high-speed railway" in ref, True, ref[:60])
            check("参考里有中文标的标注（复制按钮）",
                  pg.eval_on_selector_all(".wr-sample-ref [data-copy]", "e => e.length"), 1)
            pg.click("#wr-ref")
            pg.wait_for_timeout(150)
            check("再点收起参考", pg.eval_on_selector_all(".wr-sample-ref", "e => e.length"), 0)

            # 写作要点
            pg.click("#wr-tips")
            pg.wait_for_timeout(150)
            tips = pg.eval_on_selector_all(".wr-tips li", "e => e.length")
            check("「看写作要点」列出要点", tips >= 3, True, tips)

            # 清空（confirm 自动确认）
            pg.on("dialog", lambda d: d.accept())
            pg.click("#wr-clear")
            pg.wait_for_timeout(200)
            check("清空后文本域为空", pg.eval_on_selector("#wr-input", "e => e.value"), "")
            check("清空后字数归零", pg.inner_text("#wr-wc"), "0")
            saved2 = pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.write.v1')||'{}')")
            check("清空后草稿也清掉", (saved2.get("drafts") or {}).get("tr-highspeed"), "")

            # 太短不许批改
            pg.fill("#wr-input", "I like tea.")
            pg.wait_for_timeout(120)
            pg.click("#wr-grade")
            pg.wait_for_timeout(250)
            tst = pg.inner_text("body")
            check("太短时拦下来不给 AI 批改", "太短了" in tst, True)
            check("太短时没发请求", seen["n"], 0)

            # ---------------- D. AI 批改（mock SSE） ----------------
            log("D) AI 批改（mock 流式回包）")
            pg.evaluate("(cfg) => localStorage.setItem('typingcet.ai.v1', cfg)", json.dumps(CFG))
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.ai && TW.ai.configured()")
            pg.wait_for_timeout(250)
            check("配了 Key 后按钮变成「AI 批改」",
                  "AI 批改" in pg.inner_text("#wr-grade")
                  and "需先配" not in pg.inner_text("#wr-grade"), True,
                  pg.inner_text("#wr-grade").strip())

            pg.fill("#wr-input", ANSWER)
            pg.wait_for_timeout(150)
            pg.click("#wr-grade")
            pg.wait_for_function("() => document.querySelector('.wr-result')", timeout=15000)
            pg.wait_for_timeout(250)

            check("发出了 1 次批改请求", seen["n"], 1)
            check("system 里写明六级阅卷 + 满分 15",
                  "六级" in seen["system"] and "15 分" in seen["system"], True)
            check("system 要求三个候选版本",
                  "稳妥版" in seen["system"] and "高分版" in seen["system"], True)
            check("system 要求 ```grade JSON 协议", "```grade" in seen["system"], True)
            check("user prompt 带上了学生作答", ANSWER[:40] in seen["user"], True)
            check("user prompt 带词数（学生作答 26 词左右）",
                  "词）" in seen["user"], True)

            check("批改后显示分数 11", pg.inner_text(".wr-score-n").strip().split("/")[0].strip(), "11")
            check("分项条 3 条", pg.eval_on_selector_all(".wr-rub-row", "e => e.length"), 3)
            check("分项条有宽度（不是全 0）",
                  pg.eval_on_selector(".wr-rub-bar i", "e => parseFloat(e.style.width) > 0"), True)
            check("问题 2 条", pg.eval_on_selector_all(".wr-issue", "e => e.length"), 2)
            check("问题里带「原文 → 改法 → 原因」",
                  pg.eval_on_selector_all(".wr-issue .wr-quote", "e => e.length") == 2
                  and pg.eval_on_selector_all(".wr-issue .wr-fix", "e => e.length") == 2
                  and pg.eval_on_selector_all(".wr-issue .wr-why", "e => e.length") == 2, True)
            check("改写稿渲染出来", "gained growing popularity" in pg.inner_text(".wr-rewrite"), True)
            check("三个候选版本三个标签",
                  pg.eval_on_selector_all(".wr-tab", "e => e.length"), 3)
            check("默认展示第一个（稳妥版）",
                  "Online learning is now popular" in pg.inner_text(".wr-sample"), True,
                  pg.inner_text(".wr-sample")[:50])
            # 切到第三个
            pg.click(".wr-tab >> nth=2")
            pg.wait_for_timeout(250)
            check("点第三个标签切换内容",
                  "routine part of college life" in pg.inner_text(".wr-sample"), True,
                  pg.inner_text(".wr-sample")[:50])
            check("切换后不丢分数（没有被重渲染成空）",
                  pg.inner_text(".wr-score-n").strip().split("/")[0].strip(), "11")
            check("「我原来写的」可展开并带词数",
                  pg.eval_on_selector_all(".wr-orig summary", "e => e.length"), 1)

            # ---------------- E. 留存 ----------------
            log("E) 留存与列表回显")
            st = pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.write.v1')||'{}')")
            r = (st.get("results") or {}).get("tr-highspeed") or {}
            check("批改结果落在 typingcet.write.v1", r.get("score"), 11)
            check("结果里存了原文（便于对比）", (r.get("text") or "")[:10], ANSWER[:10])
            check("结果里存了三个候选", len(((r.get("data") or {}).get("samples")) or []), 3)

            pg.goto(BASE + "#/writing", wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            card_txt = pg.inner_text(".wr-card >> nth=0")
            check("列表卡片回显「上次 11/15」", "上次 11/15" in card_txt, True, card_txt[:60])
            check("有草稿的题目在列表上有标记", "有草稿" in card_txt, True, card_txt[:80])
            check("KPI「已批改」= 1",
                  pg.eval_on_selector_all(".stat-card", "e => e[1].innerText.indexOf('1') >= 0"), True,
                  pg.eval_on_selector_all(".stat-card", "e => e[1].innerText"))

            # ---------------- F. 无 Key ----------------
            log("F) 没配 AI 时也能用")
            pg.evaluate("() => localStorage.removeItem('typingcet.ai.v1')")
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.ai && !TW.ai.configured()")
            pg.goto(BASE + "#/writing?id=tr-tea", wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            btn = pg.inner_text("#wr-grade")
            check("没 Key 时按钮文案提示先配 Key", "需先配" in btn, True, btn.strip())
            # 参考译文照样能看（先测，因为点批改会跳到 AI 页）
            pg.click("#wr-ref")
            pg.wait_for_timeout(200)
            check("没 Key 也能看参考译文",
                  "Tea is the most common drink" in pg.inner_text(".wr-sample-ref"), True)
            pg.click("#wr-ref")
            pg.wait_for_timeout(150)

            pg.fill("#wr-input", "Tea is a very common drink in China for a long history and now it is popular.")
            pg.wait_for_timeout(120)
            before = seen["n"]
            pg.click("#wr-grade")
            pg.wait_for_timeout(500)
            check("点批改不发请求，只提示去配 Key",
                  seen["n"] == before and "还没配置 AI Key" in pg.inner_text("body"), True)
            check("并把人送到 AI 页去填 Key",
                  "ai" in pg.evaluate("() => location.hash"), True,
                  pg.evaluate("() => location.hash"))
            # 草稿按题存（不同题不串）
            pg.goto(BASE + "#/writing?id=tr-highspeed", wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            back = pg.eval_on_selector("#wr-input", "e => e.value")
            check("草稿按题目分开存，不串题",
                  back == ANSWER and "tea" not in back.lower(), True, back[:50])

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
