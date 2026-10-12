# -*- coding: utf-8 -*-
"""给「真题阅读」截几张图，人工看排版（浅色/暗色/移动端）。
用法： NODE_OPTIONS= python tools/shot_reading.py
输出： docs/shots/rd-*.png
"""
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "shots"
PORT = 8791


def main():
    from playwright.sync_api import sync_playwright

    srv = subprocess.Popen([sys.executable, str(ROOT / "tools/serve.py"), "--port", str(PORT)],
                           cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    base = "http://127.0.0.1:%d/" % PORT
    SHOTS.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        exe = Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
        kw = {"executable_path": str(exe)} if exe.exists() else {}
        b = pw.chromium.launch(**kw)
        pg = b.new_page(viewport={"width": 1440, "height": 1000})
        pg.goto(base + "#/reading", wait_until="domcontentloaded")
        pg.evaluate("() => localStorage.clear()")
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(SHOTS / "rd-01-quiz.png"))
        print("rd-01-quiz")

        # 答题卡：先填几题再判分
        pg.click(".rd-sub[data-mode='card']")
        pg.wait_for_timeout(600)
        for q, l in [("1", "F"), ("2", "N"), ("3", "B"), ("4", "H")]:
            pg.click(".ans-sec[data-sec='a'] .ans-q[data-q='%s'] .ans-opt[data-l='%s']" % (q, l))
        pg.wait_for_timeout(300)
        pg.click(".ans-bar [data-act='submit']")
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(SHOTS / "rd-02-card-graded.png"))
        print("rd-02-card-graded")

        # 暗色
        pg.click("#theme-btn")
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(SHOTS / "rd-03-card-dark.png"))
        print("rd-03-card-dark")
        pg.click("#theme-btn")
        pg.wait_for_timeout(300)

        # 答案解析
        pg.click(".rd-sub[data-mode='answer']")
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(SHOTS / "rd-04-answer.png"))
        print("rd-04-answer")

        # 译文 tab
        pg.click(".rd-tab[data-tab='translation']")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(SHOTS / "rd-05-translation.png"))
        print("rd-05-translation")

        # 移动端答题卡
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.goto(base + "#/reading?tab=practice&test=mt2&mode=card", wait_until="domcontentloaded")
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(SHOTS / "rd-06-mobile-card.png"), full_page=False)
        print("rd-06-mobile-card")

        pg.set_viewport_size({"width": 390, "height": 844})
        pg.goto(base + "#/reading?tab=source", wait_until="domcontentloaded")
        pg.wait_for_timeout(1000)
        pg.screenshot(path=str(SHOTS / "rd-07-mobile-source.png"))
        print("rd-07-mobile-source")

    srv.terminate()
    sys.stdout.flush()
    import os
    os._exit(0)


if __name__ == "__main__":
    main()
