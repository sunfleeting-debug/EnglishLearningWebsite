# -*- coding: utf-8 -*-
"""探针：注册成功后枚举 CDP 里所有 page 的 URL，看主窗是否真的开了。"""
import os, pathlib, subprocess, sys, time
from playwright.sync_api import sync_playwright

DESKTOP = pathlib.Path(__file__).resolve().parent.parent / "desktop"
ELECTRON = DESKTOP / "node_modules" / "electron" / "dist" / "electron.exe"
os.environ.pop("ELECTRON_RUN_AS_NODE", None)
os.environ["NODE_OPTIONS"] = ""

proc = subprocess.Popen(
    [str(ELECTRON), str(DESKTOP), "--remote-debugging-port=9334"],
    cwd=str(DESKTOP), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as pw:
        browser = None
        for _ in range(30):
            time.sleep(0.5)
            try:
                browser = pw.chromium.connect_over_cdp("http://127.0.0.1:9334")
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
        print("login url:", login.url if login else None)
        login.evaluate("localStorage.setItem('typingcet.apiBase', 'http://127.0.0.1:8791')")
        login.click("#tab-register")
        login.fill("#email", "desktop-probe@example.com")
        login.fill("#password", "test123456")
        login.click("#submit")
        login.wait_for_selector(".msg.ok", timeout=10000)
        for i in range(16):
            time.sleep(0.5)
            pages = [pg for c in browser.contexts for pg in c.pages]
            print(i, [pg.url for pg in pages])
finally:
    proc.terminate()
