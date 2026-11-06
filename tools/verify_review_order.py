# -*- coding: utf-8 -*-
"""核验复习页的「顺序 / 乱序」开关
   ------------------------------------------------------------
   覆盖：开关渲染、点了之后写进设置并带进 URL、顺序模式首个词 = 队首、
   乱序模式确实打乱（多次重进不完全相同）、顺序模式不再被「最近答错」重排。
   用法：python tools/verify_review_order.py
"""
import json
import os
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 5182
BASE = "http://127.0.0.1:%d/" % PORT
PY = sys.executable

TOTAL = [0]
fails = []


def check(name, got, want, extra=""):
    TOTAL[0] += 1
    ok = got == want
    if not ok:
        fails.append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name
          + ("  " + str(extra) if extra != "" else "")
          + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def port_free(p):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", p)) != 0
    finally:
        s.close()


def wait_http(url, timeout=15):
    import urllib.request
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                return r.status
        except Exception:
            time.sleep(0.3)
    return 0


def main():
    if not port_free(PORT):
        print("端口被占用")
        return 3
    procs = [subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    try:
        if wait_http(BASE + "index.html") != 200:
            print("静态服务未就绪")
            return 3
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1280, "height": 1000})
            ctx.add_init_script("localStorage.setItem('typingcet.guest','1')")
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append("console:" + m.text) if m.type == "error" else None)

            pg.goto(BASE + "#/srs", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.store && TW.store.srs", timeout=15000)
            pg.wait_for_timeout(400)

            # 造一个到期队列：取词库前 20 个词入队（默认到期日就是今天）
            n = pg.evaluate("""() => {
                const ws = TW.data.words.slice(0, 20);
                ws.forEach(w => TW.store.srs.enroll(w.word, w.book || '',
                                                    TW.data.brief ? TW.data.brief(w) : ''));
                return Object.keys(TW.store.state.srs).length;
            }""")
            check("队列已塞入 20 个词", n, 20)
            pg.wait_for_timeout(500)   # store.save() 有 120ms 防抖，等落盘再 reload
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_timeout(900)

            check("复习页有顺序开关", pg.locator("#sr-order button").count(), 2)
            check("开关标的是顺序 / 乱序",
                  pg.eval_on_selector_all("#sr-order button", "e => e.map(x => x.textContent)"),
                  ["顺序", "乱序"])
            check("默认高亮「顺序」（跟设置里默认值一致）",
                  pg.inner_text("#sr-order button.active"), "顺序")

            due = pg.evaluate("() => TW.store.srs.dueList().map(r => r.w)")
            check("队列有到期词", len(due) >= 10, True, "%d 个" % len(due))

            # ---- 切到乱序 ----
            pg.click('#sr-order button[data-order="random"]')
            pg.wait_for_timeout(900)
            check("切乱序后写进设置", pg.evaluate("() => TW.store.settings.order"), "random")
            check("URL 带上 order=random", "order=random" in pg.evaluate("() => location.hash"), True)
            check("今日任务说明里写明按乱序出词",
                  "练习时按" in pg.inner_text(".wrap") and "乱序" in pg.inner_text(".wrap"), True)
            check("乱序按钮变高亮", pg.inner_text("#sr-order button.active"), "乱序")
            pg.screenshot(path=os.path.join(ROOT, "tools/_shots/review-order-random.png"), full_page=True)

            # 乱序真的打乱：多次重进练习页，首个词不该次次都是队首
            firsts = []
            for _ in range(6):
                pg.goto(BASE + "#/practice?src=srs&mode=type&order=random", wait_until="domcontentloaded")
                # 同一 URL 的 goto 在 SPA 里不重载，会命中「会话续接」拿回同一份词池 ⇒ 必须 reload
                pg.reload(wait_until="domcontentloaded")
                pg.wait_for_selector("#p-word", timeout=15000)
                pg.wait_for_timeout(250)
                firsts.append(pg.inner_text("#p-word").strip())
            check("乱序下题目顺序被打乱（6 次里至少 2 种首词）",
                  len(set(firsts)) >= 2, True, firsts)

            # ---- 切回顺序 ----
            pg.goto(BASE + "#/srs?order=seq", wait_until="domcontentloaded")
            pg.wait_for_timeout(700)
            check("URL 的 order=seq 能直接生效", pg.inner_text("#sr-order button.active"), "顺序")
            check("切顺序后写回设置", pg.evaluate("() => TW.store.settings.order"), "seq")
            pg.screenshot(path=os.path.join(ROOT, "tools/_shots/review-order-seq.png"), full_page=True)

            pg.click("#sr-start")
            pg.wait_for_selector("#p-word", timeout=20000)
            pg.wait_for_timeout(300)
            check("顺序模式第一个词 = 队首（到期最早）",
                  pg.inner_text("#p-word").strip(), due[0])
            check("开始复习的 URL 带上了 order=seq",
                  "order=seq" in pg.evaluate("() => location.hash"), True,
                  pg.evaluate("() => location.hash"))

            # 设置页（同一个开关，措辞要一致）
            pg.goto(BASE + "#/settings", wait_until="domcontentloaded")
            pg.wait_for_timeout(700)
            check("设置页也写作「顺序 / 乱序」",
                  pg.eval_on_selector_all("#set-order button", "e => e.map(x => x.textContent)"),
                  ["顺序", "乱序"])
            check("设置页高亮与复习页一致", pg.inner_text("#set-order button.active"), "顺序")

            check("无 JS 报错", [e for e in errs if "ERR_NAME_NOT_RESOLVED" not in e], [])
            b.close()
    finally:
        for x in procs:
            try:
                x.terminate()
            except Exception:
                pass

    print("\n通过 %d / %d 项" % (TOTAL[0] - len(fails), TOTAL[0]))
    if fails:
        print("失败：" + "；".join(fails))
    return 0 if not fails else 1


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    os._exit(code)
