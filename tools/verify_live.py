# -*- coding: utf-8 -*-
"""线上验收：真开一次 GitHub Pages 站点，检查渲染 / 资源 / 交互 / 控制台错误。

用法：
    NODE_OPTIONS= python -u tools/verify_live.py
    URL=https://<user>.github.io/<repo>/ NODE_OPTIONS= python -u tools/verify_live.py
"""
from __future__ import annotations

import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get("URL", "https://sunfleeting-debug.github.io/EnglishLearningWebsite/")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "shots"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")

errors, failed, checks = [], [], []


def check(name, got, want=True):
    ok = got == want
    checks.append(ok)
    print(("  [OK]   " if ok else "  [FAIL] ") + name + ("" if ok else "  got=%r want=%r" % (got, want)))


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        kw = {
            # 站点在 *.github.io（Fastly CDN）上可直连，跳过系统代理更快更稳。
            # 注意：github.com 本身在本机需要走代理，但这里只访问 Pages 站点，不涉及。
            "args": ["--no-proxy-server"],
        }
        if EXE.exists():
            kw["executable_path"] = str(EXE)
        b = pw.chromium.launch(**kw)
        pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))
        pg.on("requestfailed", lambda r: failed.append(r.url + " :: " + str(r.failure)))

        pg.goto(URL, wait_until="load", timeout=60000)
        pg.wait_for_timeout(800)
        check("标题正确", "六级单词速记" in pg.title(), True)
        check("首页渲染出内容", pg.evaluate("() => document.body.innerText.length > 50"), True)
        pg.screenshot(path=str(SHOTS / "22-live-home.png"))

        # 词库页
        pg.goto(URL + "#/books?book=week1", wait_until="load", timeout=60000)
        pg.wait_for_timeout(900)
        rows = pg.evaluate("() => document.querySelectorAll('#bk-list .wl-row').length")
        check("线上词库列表有词条", rows >= 10, True)
        pg.screenshot(path=str(SHOTS / "23-live-books.png"))

        # 词库页点单词文本 → 进入详情页（本次修复的核心交互）
        pg.locator("#bk-list .wl-row .wl-link").first.click()
        pg.wait_for_timeout(900)
        check("线上点击单词进入详情页", "#/word" in pg.evaluate("() => location.hash"), True)

        # 详情页（按需加载 5MB 词典数据）
        wid = pg.evaluate("() => (TW.WORDS.find(w => w.word === 'drastic') || {}).id")
        pg.goto(URL + "#/word?id=" + str(wid), wait_until="domcontentloaded", timeout=60000)
        try:
            pg.wait_for_selector(".dc-word", timeout=60000)
        except Exception:
            pass
        pg.wait_for_timeout(600)
        check("线上详情页渲染", (pg.evaluate("() => (TW.$('.dc-word')||{}).textContent") or "").strip(), "drastic")
        check("线上词典卡按需加载成功", pg.evaluate("() => TW.data.dictReady()"), True)
        check("线上扩展词条按需加载成功", pg.evaluate("() => TW.data.extReady()"), True)
        pg.screenshot(path=str(SHOTS / "24-live-word.png"), full_page=True)

        # 近义词跳转
        sl = pg.locator(".dc-synwords a.wref").first
        if sl.count():
            sl.click()
            pg.wait_for_timeout(900)
            check("线上近义词跳转", "#/word" in pg.evaluate("() => location.hash"), True)

        # 发音：默认「自动」模式应发出在线真人音频请求（有道 dictvoice）
        pg.goto(URL, wait_until="load", timeout=60000)
        pg.wait_for_timeout(500)
        audio_reqs = []
        pg.on("request", lambda r: audio_reqs.append(r.url) if "dictvoice" in r.url else None)
        pg.evaluate("() => TW.speech.speak('memory', 'us')")
        pg.wait_for_timeout(2000)
        check("线上发音走在线真人音频", len(audio_reqs) > 0, True)

        # 真题阅读（网页版做题，含 42 张渲染页图）
        pg.set_viewport_size({"width": 1440, "height": 900})
        pg.goto(URL + "#/reading", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1200)
        check("线上阅读页渲染", pg.locator(".rd-tab").count(), 3)
        check("线上阅读页原文页图（6 页）", pg.locator(".rd-img").count(), 6)
        pg.goto(URL + "#/reading?tab=practice&test=mt1&mode=card", wait_until="load", timeout=60000)
        pg.wait_for_timeout(1200)
        check("线上阅读答题卡题量 = 30", pg.locator(".ans-q").count(), 30)
        # 页面图必须真的能取到（离线渲染的图没推上去就会在这里暴露）
        img_ok = pg.evaluate("""async () => {
          const r = await fetch('assets/reading/practice/p01.webp');
          return r.ok && (r.headers.get('content-type') || '').indexOf('image') >= 0;
        }""")
        check("线上阅读页图可加载", img_ok, True)
        pg.screenshot(path=str(SHOTS / "27-live-reading.png"))

        # 移动端
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.goto(URL, wait_until="load", timeout=60000)
        pg.wait_for_timeout(800)
        ovf = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check("线上移动端无横向溢出", ovf <= 1, True)
        pg.screenshot(path=str(SHOTS / "25-live-mobile.png"))

        check("控制台错误数 = 0", len(errors), 0)
        check("资源加载失败数 = 0", len(failed), 0)

        # 收尾：刻意不调用 b.close()。
        # 本机实测它偶发挂死（详情页 + 有道音频请求挂起时 Chromium 不响应 close，
        # 进程停在 CPU 0 永不退出，连已完成的断言结果都被一起吞掉）。
        # 改为直接输出汇总并 os._exit，由操作系统回收 Chromium 子进程。
        report_and_exit()


def report_and_exit():
    print("")
    print("=== 失败项 ===")
    print("失败 %d / 共 %d 项断言" % (len([c for c in checks if not c]), len(checks)))
    if errors:
        print("=== 控制台错误 ===")
        for e in errors[:20]:
            print("  " + e)
    if failed:
        print("=== 资源失败 ===")
        for f in failed[:20]:
            print("  " + f)
    sys.stdout.flush()
    os._exit(0 if all(checks) and not errors and not failed else 3)


if __name__ == "__main__":
    main()
