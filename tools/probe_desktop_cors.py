# -*- coding: utf-8 -*-
"""实机验证 v1.1.0 打包 exe：登录窗出现 + 应用内 fetch 真后端 /api/health（验证 CORS Origin 重写）。"""
import os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

DESKTOP = pathlib.Path(r"F:\MyProject\EnglishLearningWebsite\desktop")
EXE = DESKTOP / "dist" / "EnglishLearningStation-1.1.0-portable.exe"
os.environ.pop("ELECTRON_RUN_AS_NODE", None)
os.environ["NODE_OPTIONS"] = ""

proc = subprocess.Popen([str(EXE), "--remote-debugging-port=9336"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as pw:
        browser = None
        for _ in range(60):  # portable 首次自解压较慢
            time.sleep(0.5)
            try:
                browser = pw.chromium.connect_over_cdp("http://127.0.0.1:9336")
                break
            except Exception:
                pass
        login = None
        for _ in range(30):
            pages = [pg for c in browser.contexts for pg in c.pages]
            login = next((pg for pg in pages if "login.html" in pg.url), None)
            if login:
                break
            time.sleep(0.5)
        print("登录窗:", "OK" if login else "FAIL", login.url if login else "")
        # 直接打真后端：Origin 重写生效时应返回 health JSON（本机直连 workers.dev 需系统代理）
        for attempt in range(3):
            try:
                r = login.evaluate("""fetch('https://cet-words-api.sunfleeting.workers.dev/api/health', {signal: AbortSignal.timeout(12000)})
                    .then(r => r.json()).then(j => 'OK:' + (j.ok === true || !!j.service))
                    .catch(e => 'ERR:' + e.message)""")
                print("真后端 fetch:", r)
                break
            except Exception as e:
                print("attempt", attempt, "err:", str(e)[:80])
                # 页面可能被自动登录关掉 → 重新找 login.html
                pages = [pg for c in browser.contexts for pg in c.pages]
                login = next((pg for pg in pages if "login.html" in pg.url), None)
                if not login:
                    import json, urllib.request
                    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9336/json/list", timeout=2).read())
                    print("targets:", [(t.get("type"), t.get("url")) for t in targets])
                    break
                time.sleep(1)
finally:
    proc.terminate()
