# -*- coding: utf-8 -*-
"""端到端验证桌面壳登录流程：登录窗渲染 → 注册（打本地 mock 后端 8791）→
token 写入 localStorage → 登录窗自动关闭 → 主窗打开。
Python 版 playwright 没有 electron 驱动，走 CDP（--remote-debugging-port）连。
需要先起 `python tools/mock_api.py`。"""
import os
import pathlib
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

DESKTOP = pathlib.Path(__file__).resolve().parent.parent / "desktop"
ELECTRON = DESKTOP / "node_modules" / "electron" / "dist" / "electron.exe"
os.environ.pop("ELECTRON_RUN_AS_NODE", None)  # 🔴 本机环境注入了这个变量，必须清掉
os.environ["NODE_OPTIONS"] = ""

fails = []
def check(name, cond):
    print(("  [OK]  " if cond else "  [FAIL]") + " " + name)
    if not cond:
        fails.append(name)

proc = subprocess.Popen(
    [str(ELECTRON), str(DESKTOP), "--remote-debugging-port=9333"],
    cwd=str(DESKTOP), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as pw:
        ctx = None
        for _ in range(30):  # 等 CDP 起来
            time.sleep(0.5)
            try:
                browser = pw.chromium.connect_over_cdp("http://127.0.0.1:9333")
                break
            except Exception:
                browser = None
        check("CDP 连上", browser is not None)
        if not browser:
            sys.exit(1)

        def find_page(word):
            for ctx2 in browser.contexts:
                for pg in ctx2.pages:
                    if word in (pg.url or ""):
                        return pg
            return None

        login = None
        for _ in range(20):
            login = find_page("login.html")
            if login:
                break
            time.sleep(0.5)
        check("登录窗页面出现（login.html）", login is not None)
        if not login:
            sys.exit(1)
        login.wait_for_load_state("domcontentloaded")
        check("登录窗渲染出提交按钮", login.locator("#submit").count() == 1)

        # 指向本地 mock 后端（真后端在真机上走系统代理，逻辑同一条）
        login.evaluate("localStorage.setItem('typingcet.apiBase', 'http://127.0.0.1:8791')")

        login.click("#tab-register")
        login.fill("#email", "desktop-test@example.com")
        login.fill("#password", "test123456")
        login.click("#submit")
        try:
            login.wait_for_selector(".msg.ok", timeout=8000)
            check("注册成功提示", True)
        except Exception:
            # 幂等：之前跑过已注册 → 改走登录
            err = (login.text_content("#msg") or "")
            if "已注册" in err or "密码" in err:
                login.click("#tab-login")
                login.click("#submit")
                try:
                    login.wait_for_selector(".msg.ok", timeout=8000)
                    check("已注册→改登录成功", True)
                except Exception:
                    check("改登录成功（msg=" + (login.text_content("#msg") or "") + "）", False)
            else:
                check("注册成功提示（msg=" + err + "）", False)

        check("token 已写入 localStorage", login.evaluate("!!localStorage.getItem('typingcet.token')"))

        # 登录窗应自动关闭，随后主窗打开。
        # 🔴 playwright connect_over_cdp 不追踪应用后开的新窗口 → 用 CDP 原生 /json/list 查
        main = None
        import json as _json
        import urllib.request as _ur
        for _ in range(30):
            try:
                targets = _json.loads(_ur.urlopen("http://127.0.0.1:9333/json/list", timeout=2).read())
                mains = [t for t in targets
                         if t.get("type") == "page" and "login.html" not in t.get("url", "")]
                if mains:
                    main = mains[0]
                    break
            except Exception:
                pass
            time.sleep(0.5)
        if not main:
            try:
                targets = _json.loads(_ur.urlopen("http://127.0.0.1:9333/json/list", timeout=2).read())
                print("  [DEBUG] CDP targets:", [(t.get("type"), t.get("url")) for t in targets])
            except Exception as e:
                print("  [DEBUG] CDP list 不可达:", e)
        if main:
            # 主窗 target 存在即算通过（playwright 页面对象拿不到后开的窗口，标题用 CDP 字段）
            title = main.get("title", "")
            check("主窗打开（标题=英语学习站…）", "英语学习站" in title)
        else:
            check("主窗打开", False)
        browser.close()
finally:
    proc.terminate()

print("失败 %d 项" % len(fails))
sys.exit(1 if fails else 0)
