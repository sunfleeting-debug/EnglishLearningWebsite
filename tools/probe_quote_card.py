# -*- coding: utf-8 -*-
"""名句加载卡探针：把词典分块请求挂起，让等待页停留，截图确认效果。"""
import pathlib, sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")


def main():
    with sync_playwright() as p:
        pg = p.chromium.launch(executable_path=str(EXE), headless=True).new_page()
        held = []
        pg.route("**/data/dict/*.js", lambda route: held.append(route))   # 挂起不回应
        pg.goto(BASE + "#/", wait_until="domcontentloaded")
        pg.wait_for_timeout(1000)
        print("QUOTES:", pg.evaluate("() => !!(TW.QUOTES && TW.QUOTES.quotes.length)"))
        # 挑一个字母块还没载的词
        wid = pg.evaluate("() => { const w = TW.WORDS.find(x => !TW.data.dictLetterReady(x.word));"
                          "  return w ? String(w.id) : ''; }")
        print("target word id:", wid)
        pg.goto(BASE + "#/word?id=" + wid, wait_until="domcontentloaded")
        pg.wait_for_timeout(800)
        txt = pg.evaluate("() => (document.querySelector('.load-quote') || {textContent: ''}).textContent")
        print("quote card:", txt[:120])
        pg.screenshot(path="docs/shots/34-load-quote.png")
        print("shot saved")
        # 释放挂起请求（合法空脚本），避免进程退出时有悬挂连接
        for r in held:
            r.fulfill(status=200, content_type="application/javascript", body="/* probe stub */")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
