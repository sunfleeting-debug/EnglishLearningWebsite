# -*- coding: utf-8 -*-
"""探针：登录窗里 window.desktopLogin 是否被 preload 暴露成功。"""
import os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

DESKTOP = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite\desktop")
ELECTRON = DESKTOP / "node_modules" / "electron" / "dist" / "electron.exe"
os.environ.pop("ELECTRON_RUN_AS_NODE", None)
os.environ["NODE_OPTIONS"] = ""

proc = subprocess.Popen([str(ELECTRON), str(DESKTOP), "--remote-debugging-port=9335"],
                        cwd=str(DESKTOP),
                        stdout=open(r"F:\MyProject\EnglishLearningWebsite\tools\.probe-el.log", "w"),
                        stderr=subprocess.STDOUT)
try:
    with sync_playwright() as pw:
        browser = None
        for _ in range(30):
            time.sleep(0.5)
            try:
                browser = pw.chromium.connect_over_cdp("http://127.0.0.1:9335")
                break
            except Exception:
                pass
        login = None
        for _ in range(20):
            pages = [pg for c in browser.contexts for pg in c.pages]
            login = next((pg for pg in pages if "login.html" in pg.url), None)
            if login:
                break
            time.sleep(0.5)
        print("typeof desktopLogin:", login.evaluate("typeof window.desktopLogin"))
        login.evaluate("window.desktopLogin.close()")
        for i in range(10):
            time.sleep(0.5)
            pages = [pg for c in browser.contexts for pg in c.pages]
            print(i, [pg.url for pg in pages])
finally:
    proc.terminate()
