# -*- coding: utf-8 -*-
"""线上详情页探针：抓控制台错误、失败请求、加载状态。
用法：NODE_OPTIONS= python -u tools/probe_live_word.py
"""
import pathlib, sys

from playwright.sync_api import sync_playwright

URL = "https://sunfleeting-debug.github.io/EnglishLearningWebsite/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")


def main():
    with sync_playwright() as p:
        b = pw_chrome(p)
        pg = b.new_page()
        logs = []
        pg.on("console", lambda m: logs.append("[console.%s] %s" % (m.type, m.text[:300])))
        pg.on("pageerror", lambda e: logs.append("[pageerror] %s" % str(e)[:300]))
        pg.on("requeststarted", lambda r: logs.append("[start] %s" % r.url[-70:]) if "dict" in r.url or "deck" in r.url else None)
        pg.on("requestfinished", lambda r: logs.append("[done] %s" % r.url[-70:]) if "dict" in r.url or "deck" in r.url else None)
        pg.on("requestfailed", lambda r: logs.append("[reqfail] %s %s" % (r.url[-70:], r.failure)) if "dict" in r.url or "deck" in r.url else None)
        pg.on("response", lambda r: logs.append("[resp %d] %s (%dB)" % (r.status, r.url[-60:], 0)) if r.status >= 400 else None)

        pg.goto(URL + "#/", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(2500)
        wid = pg.evaluate("() => (TW.WORDS.find(w => w.word === 'drastic') || {}).id")
        print("wid:", wid)
        print("allDecksReady fn:", pg.evaluate("() => typeof TW.data.allDecksReady"))
        pg.goto(URL + "#/word?id=" + str(wid), wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(6000)
        print("hash:", pg.evaluate("() => location.hash"))
        print("view len:", pg.evaluate("() => (document.getElementById('view')||{innerHTML:''}).innerHTML.length"))
        print("owner:", pg.evaluate("() => (document.getElementById('view')||{dataset:{}}).dataset.owner"))
        print("dc-word:", pg.evaluate("() => (TW.$('.dc-word')||{}).textContent"))
        print("dictReady:", pg.evaluate("() => TW.data.dictReady()"))
        print("extReady:", pg.evaluate("() => TW.data.extReady()"))
        print("decksLoaded:", pg.evaluate("() => TW.data.decksLoaded().join(',')"))

        # 页面内手动 fetch dict.js：区分「浏览器网络问题」vs「应用逻辑问题」
        t0 = pg.evaluate("() => performance.now()")
        fetched = pg.evaluate("""async () => {
            try {
                const r = await fetch('data/dict.js');
                const t = await r.text();
                return r.status + ' len=' + t.length + ' tail=' + t.slice(-30);
            } catch (e) { return 'FETCH_ERR ' + e; }
        }""")
        print("in-page fetch dict.js (%.1fs):" % ((pg.evaluate("() => performance.now()") - t0) / 1000), fetched)

        # 手动注入 script 标签
        injected = pg.evaluate("""async () => {
            return new Promise(function (resolve) {
                const s = document.createElement('script');
                s.src = 'data/dict.js';
                s.onload = () => resolve('onload, TW.DICT keys=' + Object.keys(window.TW.DICT || {}).length);
                s.onerror = (e) => resolve('onerror');
                document.head.appendChild(s);
                setTimeout(() => resolve('TIMEOUT_20s, s.readyState?'), 20000);
            });
        }""")
        print("manual inject:", injected)
        print("dictReady after:", pg.evaluate("() => TW.data.dictReady()"))
        res = pg.evaluate("() => performance.getEntriesByType('resource').map(r => r.name.split('/').pop() + ':' + r.transferSize + ':' + r.decodedBodySize)")
        print("---- resources ----")
        for r in res:
            print(r)
        print("---- logs ----")
        for l in logs[:40]:
            print(l)
    return 0


def pw_chrome(p):
    return p.chromium.launch(executable_path=str(EXE), headless=True,
                             args=["--no-proxy-server"])


if __name__ == "__main__":
    sys.exit(main())
