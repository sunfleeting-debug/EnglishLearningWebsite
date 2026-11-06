# -*- coding: utf-8 -*-
"""核验 AI 通道的两条「限流」策略（1015/429 为什么老是缠着你）
   ------------------------------------------------------------
   覆盖：
     1. 自定义接口默认走浏览器直连（打 <base>/chat/completions）
     2. 偶发一次 1015/429 → 自动等 1.5 秒在同一通道重试一次，用户看不到红字
     3. 持续限流 → 只重试一次就放弃（不会把用户晾在那儿轮询），最终照实报错
     4. 放弃后才退到 Worker 转发（共享出口 IP），并且这条记录有 3 分钟保质期
     5. 3 分钟过后自动重新试直连（旧实现是「一次限流，整页会话永久走 Worker」）

   为什么单独测这个：旧实现里 transportMemo 一旦被写成 'worker' 就再也不回退，
   一次偶发限流会把整个页面会话推到最容易继续被限的那条路上 —— 症状就是你看到
   的「经常报 1015」。这条断言就是防止它退回去。

   用法：python tools/verify_ai_transport.py
"""
import os
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 5183
BASE = "http://127.0.0.1:%d/" % PORT
PY = sys.executable
HOST = "agnes.example.com"
API = "https://%s/v1" % HOST

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
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"})
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(req, timeout=3) as r:
                return r.status
        except Exception:
            time.sleep(0.3)
    return 0


# 桩：拦下发往假接口的请求，按 __mode 决定「正常 / 一直限流 / 只限第一次」
STUB = """
window.__calls = [];
window.__mode = 'ok';
var realFetch = window.fetch.bind(window);
window.fetch = function (url, init) {
  var u = String(url);
  if (u.indexOf('%s') < 0) return realFetch(url, init);
  window.__calls.push(u);
  var n = window.__calls.length;
  if (window.__mode === 'cors') return Promise.reject(new TypeError('Failed to fetch'));
  var limited = (window.__mode === 'rl') || (window.__mode === 'rl1' && n === 1);
  var body = limited
    ? { error: { message: 'error code: 1015' } }
    : { model: 'stub', choices: [{ message: { content: 'OK-REPLY' } }] };
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: limited ? 429 : 200,
    headers: { 'Content-Type': 'application/json' }
  }));
};
var _now = Date.now.bind(Date);
window.__nowOff = 0;
Date.now = function () { return _now() + window.__nowOff; };
""" % HOST


def main():
    procs = []
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
            ctx = b.new_context(viewport={"width": 1280, "height": 900})
            ctx.add_init_script("localStorage.setItem('typingcet.guest','1')")
            ctx.add_init_script(STUB)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))

            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.ai && TW.ai.save", timeout=15000)

            # 配一个「自定义接口」；后端置为未配置，这样退到 Worker 会立刻失败，测起来确定
            pg.evaluate("""() => {
                TW.ai.save({ provider: 'custom', baseUrl: '%s',
                             keys: { custom: 'sk-test-1234567890' },
                             models: { custom: 'stub-model' } });
                TW.api = TW.api || {};
                TW.api.configured = function () { return false; };
            }""" % API)
            check("配置就绪（自定义接口）", pg.evaluate("() => TW.ai.configured()"), True)

            def ask():
                return pg.evaluate("""() => TW.ai.chat({ messages: [{ role: 'user', content: 'hi' }] })
                    .then(r => 'ok:' + r.text, e => 'err:' + (e && e.message))""")

            def calls():
                return pg.evaluate("() => window.__calls.slice()")

            def set_mode(m):
                pg.evaluate("(m) => { window.__mode = m; }", m)

            # ---- 1. 正常一次 ----
            set_mode("ok")
            r = ask()
            check("正常请求成功", r, "ok:OK-REPLY")
            c1 = calls()
            check("只发了一次请求", len(c1), 1)
            check("打到自定义接口的 /chat/completions（浏览器直连）",
                  c1[0], API + "/chat/completions")

            # ---- 2. 偶发限流：自动重试 ----
            pg.evaluate("() => { window.__calls.length = 0; }")
            set_mode("rl1")
            t0 = time.time()
            r = ask()
            cost = time.time() - t0
            check("偶发一次 1015 后自动重试成功（用户看不到红字）", r, "ok:OK-REPLY")
            c2 = calls()
            check("重试用的是同一通道（2 次都直连，没被推给 Worker）",
                  [u for u in c2], [API + "/chat/completions"] * 2)
            check("重试前等了约 1.5 秒（不是立刻猛打）", cost >= 1.4, True, "%.2fs" % cost)

            # ---- 3. 持续限流：只重试一次 ----
            pg.evaluate("() => { window.__calls.length = 0; }")
            set_mode("rl")
            r = ask()
            check("持续 1015 时最终报错", r.startswith("err:"), True, r[:120])
            check("报的是真正的限流原因，不是「后端未配置」这类无关话", "1015" in r, True, r[:120])
            c3 = calls()
            check("只重试一次，不做无限轮询", len(c3), 2, "%d 次" % len(c3))

            # ---- 4. 放弃后钉在 Worker，且有保质期 ----
            pg.evaluate("() => { window.__calls.length = 0; }")
            set_mode("ok")
            r = ask()
            check("限流后短时间内的新请求不再打直连", len(calls()), 0)
            check("这段时间走 Worker（本测里 Worker 未配置 ⇒ 直接失败）",
                  "后端地址未配置" in r, True, r[:80])

            # ---- 5. 3 分钟后自动试回直连 ----
            pg.evaluate("() => { window.__nowOff = 186000; }")   # 推后 3 分 6 秒
            r = ask()
            check("3 分钟后重新试直连并成功（不再永久钉在 Worker 上）", r, "ok:OK-REPLY")
            c5 = calls()
            check("恢复后打的是自定义接口", c5 and c5[-1], API + "/chat/completions")

            pg.evaluate("() => { window.__calls.length = 0; }")
            r = ask()
            check("恢复成功后保持直连", [r, len(calls())], ["ok:OK-REPLY", 1])

            # ---- 6. 跨域不通那条路：记久一点，别每 3 分钟白撞一次 ----
            pg.evaluate("() => { window.__calls.length = 0; }")
            set_mode("cors")
            r = ask()
            check("跨域被拦时照实报错", r.startswith("err:"), True, r[:70])
            check("报的是「连不上/跨域」而不是「后端未配置」", "连不上" in r, True, r[:70])
            check("跨域只试一次直连就放弃", len(calls()), 1)

            pg.evaluate("() => { window.__calls.length = 0; }")
            set_mode("ok")
            ask()
            check("跨域后短时间也不再去撞直连", len(calls()), 0)
            pg.evaluate("() => { window.__nowOff += 6 * 60 * 1000; }")   # 再过 6 分钟
            ask()
            check("跨域不通的记 30 分钟（6 分钟后仍不撞直连）", len(calls()), 0)
            pg.evaluate("() => { window.__nowOff += 25 * 60 * 1000; }")
            r = ask()
            check("超过 30 分钟后重新试直连", r, "ok:OK-REPLY")

            check("无 JS 报错", errs, [])
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
