# -*- coding: utf-8 -*-
"""截图核验：听力列表 / 听力做题 / 交卷后解析 / 单词页 AI 讲解。
用法：NODE_OPTIONS= python tools/shot_extras.py
产物 tools/_shots/（已 gitignore）。
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
OUT = ROOT / "tools" / "_shots"
PORT = int(os.environ.get("PORT", "5195"))
BASE = "http://127.0.0.1:%d/" % PORT
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

CFG = {"provider": "custom", "keys": {"custom": "sk-test-abcdef123456"},
       "models": {"custom": "agnes-3.0-flash"},
       "baseUrl": "https://example.invalid/v1", "modelLists": {}}

WORD_AI = ("**本质**：account 的核心不是「账号」，而是「**把每一笔说清楚**」——所以它既能指账目，"
           "也能指「解释、说明」（account for）。\n\n"
           "**搭配**：`account for` 占（比例）/ 解释；`take sth into account` 把……考虑进去；"
           "`on account of` 因为\n\n"
           "**易混**：`account`（账目/说明）vs `count`（数数）——差在「记下来并交代清楚」。\n\n"
           "例句：Women account for nearly half of the workforce in this industry."
           "（这个行业中女性占了近一半劳动力。）")


def sse(text):
    parts = [text[:40], text[40:140], text[140:]]
    return "".join("data: " + json.dumps({"choices": [{"delta": {"content": p}}]},
                                         ensure_ascii=False) + "\n\n"
                   for p in parts if p) + "data: [DONE]\n\n"


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


def main():
    s = socket.socket(); s.settimeout(0.3)
    busy = s.connect_ex(("127.0.0.1", PORT)) == 0
    s.close()
    if busy:
        print("端口占用", PORT)
        return 3
    OUT.mkdir(parents=True, exist_ok=True)

    procs = [subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=str(ROOT),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    try:
        if wait_http(BASE + "index.html") != 200:
            print("服务未就绪"); return 3
        with sync_playwright() as pw:
            kw = {"executable_path": str(EXE)} if EXE.exists() else {}
            browser = pw.chromium.launch(**kw)
            ctx = browser.new_context(viewport={"width": 1280, "height": 1000})
            ctx.add_init_script("""
            try{ localStorage.setItem('typingcet.guest','1');
                 localStorage.setItem('typingcet.ai.v1', %s);
                 localStorage.removeItem('typingcet.listen.v1'); }catch(e){}
            """ % json.dumps(json.dumps(CFG)))
            ctx.route("**/api/ai/chat", lambda r: r.fulfill(
                status=200, content_type="text/event-stream",
                headers={"Access-Control-Allow-Origin": "*"}, body=sse(WORD_AI)))
            pg = ctx.new_page()

            # 1. 听力列表
            pg.goto(BASE + "#/listening", wait_until="domcontentloaded")
            pg.wait_for_selector(".ls-card")
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(OUT / "ls-01-list.png"), full_page=True)

            # 2. 听力做题页（答两题，未交卷）
            pg.click(".ls-card >> nth=0")
            pg.wait_for_selector("#ls-play")
            pg.wait_for_timeout(300)
            pg.click(".ls-opt >> nth=1")
            pg.wait_for_timeout(150)
            pg.screenshot(path=str(OUT / "ls-02-item.png"), full_page=True)

            # 3. 交卷 + 看原文
            pg.on("dialog", lambda d: d.accept())
            pg.click("#ls-submit")
            pg.wait_for_timeout(500)
            pg.click("#ls-trans")
            pg.wait_for_timeout(400)
            pg.screenshot(path=str(OUT / "ls-03-graded.png"), full_page=True)

            # 4. 单词页 AI 讲解
            pg.goto(BASE + "#/word?id=1", wait_until="domcontentloaded")
            pg.wait_for_selector("#dc-ai-go")
            pg.click("#dc-ai-go")
            pg.wait_for_timeout(1200)
            box = pg.query_selector("#dc-ai")
            if box:
                box.scroll_into_view_if_needed()
                pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / "wd-01-ai.png"), full_page=True)

            # 5. 题目板块（新分组）
            pg.goto(BASE + "#/quiz", wait_until="domcontentloaded")
            pg.wait_for_timeout(600)
            pg.screenshot(path=str(OUT / "qz-01-more.png"), full_page=True)

            # 6. 做题页：计时条 + 逐句对照译文
            pg.goto(BASE + "#/quiz?set=z202412-p2", wait_until="domcontentloaded")
            pg.wait_for_timeout(1600)
            pg.screenshot(path=str(OUT / "qz-02-timer.png"), full_page=False)
            if pg.query_selector("#qz-toggle-tr"):
                pg.click("#qz-toggle-tr")
                pg.wait_for_timeout(400)
                el = pg.query_selector(".qz-tr")
                if el:
                    el.scroll_into_view_if_needed()
                    pg.wait_for_timeout(300)
                pg.screenshot(path=str(OUT / "qz-03-biling.png"), full_page=False)

            # 7. 计时超时态（把阈值压到 6 秒，等它变红）
            pg.evaluate("() => { TW.store.setSetting('quizTimerMin', 0.1); }")
            pg.wait_for_timeout(350)
            pg.goto(BASE + "#/quiz?set=sim-adaptive", wait_until="domcontentloaded")
            pg.wait_for_timeout(7500)
            pg.screenshot(path=str(OUT / "qz-04-timer-over.png"), full_page=False)
            pg.evaluate("() => { TW.store.setSetting('quizTimerMin', 10); }")
            pg.wait_for_timeout(350)

            browser.close()
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass

    for f in sorted(OUT.glob("*-0*.png")):
        print(f.name, f.stat().st_size // 1024, "KB")
    return 0


if __name__ == "__main__":
    os._exit(main())
