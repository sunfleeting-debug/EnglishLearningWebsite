# -*- coding: utf-8 -*-
"""给指定单词的详情页截全页图。用法：python tools/_shot_word.py increase mild"""
import sys, pathlib
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
words = sys.argv[1:] or ["increase"]

errors = []
with sync_playwright() as pw:
    kw = {"executable_path": str(EXE)} if EXE.exists() else {}
    b = pw.chromium.launch(**kw)
    pg = b.new_page(viewport={"width": 1100, "height": 1000}, device_scale_factor=2)
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    for w in words:
        pg.goto(BASE, wait_until="domcontentloaded")
        pg.wait_for_timeout(500)
        wid = pg.evaluate("(w) => (TW.WORDS.find(x => x.word.toLowerCase() === w) || {}).id", w)
        pg.goto(BASE + "#/word?id=" + str(wid), wait_until="domcontentloaded")
        pg.wait_for_timeout(900)
        secs = pg.evaluate("() => Array.from(document.querySelectorAll('.dc-sec-title span')).map(x=>x.textContent)")
        print(w, "id=", wid, "sections=", secs)
        pg.screenshot(path="docs/shots/_shot-" + w + ".png", full_page=True)
    print("errors:", errors)
    b.close()
