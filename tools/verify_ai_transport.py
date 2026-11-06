# -*- coding: utf-8 -*-
"""核验 AI 请求通道：默认浏览器直连 + 限流退避
   ------------------------------------------------------------
   背景：自定义接口原先「直连失败就退 Worker 转发」，而 Worker 的出口 IP 被上千个
   Worker 共用，中转网关（按 IP 限流）几乎必然回 1015。更糟的是旧实现会把这次失败
   永久记住，整页会话都钉在 Worker 上 —— 症状就是用户看到的「经常报 1015」。

   现在：默认 via='direct'（只直连，绝不偷偷绕后端），失败就在同一通道退避重试一次；
   想留后路可以切 via='auto'（直连不通再转后端，且按原因分时效）。

   覆盖：
     1. 开箱即是直连；请求打到 <base>/chat/completions
     2. 偶发 1015 → 等 1.5 秒在同一通道重试成功
     3. 持续 1015 → 只重试一次就报真话，且全程不碰后端
     4. 直连模式下跨域失败也不偷偷转后端
     5. auto 模式：直连不行才转后端；限流退避 3 分钟、跨域退避 30 分钟后回直连

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
WORKER_HOST = "api.test.local"

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


# 桩：直连（agnes.example.com）按 __mode 回「正常 / 一直限流 / 只限第一次 / 跨域被拦」；
# 转后端（api.test.local）单独计数，用来断言「直连模式下一次都没碰后端」。
STUB = """
window.__calls = [];
window.__worker = [];
window.__mode = 'ok';
window.__rln = 0;
var realFetch = window.fetch.bind(window);
window.fetch = function (url, init) {
  var u = String(url);
  if (u.indexOf('%s') >= 0) {
    window.__worker.push(u);
    return Promise.resolve(new Response(JSON.stringify({ error: 'worker stub' }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    }));
  }
  if (u.indexOf('%s') < 0) return realFetch(url, init);
  window.__calls.push(u);
  if (window.__mode === 'cors') return Promise.reject(new TypeError('Failed to fetch'));
  var limited = (window.__mode === 'rl') || (window.__mode === 'rl1' && window.__rln++ === 0);
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
""" % (WORKER_HOST, HOST)


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
            ctx = b.new_context(viewport={"width": 1280, "height": 900})
            ctx.add_init_script("localStorage.setItem('typingcet.guest','1')")
            ctx.add_init_script(STUB)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))

            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.ai && TW.ai.save", timeout=15000)

            # ---- 0. 配置卡上的「连接方式」开关（先只填地址不填 Key，让配置卡露出来）----
            pg.evaluate("() => TW.ai.save({ provider: 'custom', baseUrl: '%s' })" % API)
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_selector("#ai-via", timeout=15000)
            check("配置卡有「连接方式」开关", pg.locator("#ai-via button").count(), 2)
            check("两个选项的文案",
                  pg.eval_on_selector_all("#ai-via button", "e => e.map(x => x.textContent)"),
                  ["浏览器直连", "失败转后端"])
            check("默认高亮「浏览器直连」", pg.inner_text("#ai-via button.active"), "浏览器直连")
            check("说明里写清了直连不会偷偷绕后端",
                  "不会偷偷绕到后端" in pg.inner_text(".ai-setup"), True)

            pg.click('#ai-via button[data-via="auto"]')
            check("点「失败转后端」写进配置", pg.evaluate("() => TW.ai.via()"), "auto")
            check("高亮跟着走", pg.inner_text("#ai-via button.active"), "失败转后端")
            pg.click('#ai-via button[data-via="direct"]')
            check("点回「浏览器直连」", pg.evaluate("() => TW.ai.via()"), "direct")

            # 只配自定义接口，**不设 via** —— 验的就是「开箱默认直连」
            pg.evaluate("""() => {
                TW.ai.save({ provider: 'custom', baseUrl: '%s',
                             keys: { custom: 'sk-test-1234567890' },
                             models: { custom: 'stub-model' } });
                TW.api.setBase('https://%s');
            }""" % (API, WORKER_HOST))
            check("配置就绪（自定义接口）", pg.evaluate("() => TW.ai.configured()"), True)
            check("默认连接方式 = 浏览器直连", pg.evaluate("() => TW.ai.via()"), "direct")

            def ask():
                return pg.evaluate("""() => TW.ai.chat({ messages: [{ role: 'user', content: 'hi' }] })
                    .then(r => 'ok:' + r.text, e => 'err:' + (e && e.message))""")

            def calls():
                return pg.evaluate("() => window.__calls.slice()")

            def workers():
                return pg.evaluate("() => window.__worker.length")

            def reset():
                pg.evaluate("() => { window.__calls.length = 0; window.__worker.length = 0; }")

            def mode(m):
                pg.evaluate("(m) => { window.__mode = m; window.__rln = 0; }", m)

            def travel(ms):
                pg.evaluate("(ms) => { window.__nowOff += ms; }", ms)

            # ---- 1. 正常直连 ----
            mode("ok")
            check("正常请求成功", ask(), "ok:OK-REPLY")
            c = calls()
            check("只发了一次请求", len(c), 1)
            check("打到自定义接口的 /chat/completions", c[0], API + "/chat/completions")
            check("没经过后端转发", workers(), 0)

            # ---- 2. 偶发限流：同通道退避重试 ----
            reset()
            mode("rl1")
            t0 = time.time()
            r = ask()
            cost = time.time() - t0
            check("偶发一次 1015 后自动重试成功", r, "ok:OK-REPLY")
            check("两次都是直连（没被推给 Worker）", calls(), [API + "/chat/completions"] * 2)
            check("重试前等了约 1.5 秒", cost >= 1.4, True, "%.2fs" % cost)
            check("重试过程也没碰后端", workers(), 0)

            # ---- 3. 持续限流：只重试一次，且绝不偷偷转后端 ----
            reset()
            mode("rl")
            r = ask()
            check("持续 1015 时最终报错", r.startswith("err:"), True, r[:90])
            check("报的是真正的限流原因", "1015" in r, True, r[:90])
            check("只重试一次，不做无限轮询", len(calls()), 2, "%d 次" % len(calls()))
            check("直连模式下不偷偷绕后端", workers(), 0)

            # ---- 4. 跨域失败也不绕后端 ----
            reset()
            mode("cors")
            r = ask()
            check("跨域被拦时照实报错", "连不上" in r, True, r[:70])
            check("跨域也只试一次直连", len(calls()), 1)
            check("跨域同样不绕后端", workers(), 0)

            # ---- 5. 显式切到 auto：才允许转后端 ----
            pg.evaluate("() => TW.ai.setVia('auto')")
            check("可以切到「失败转后端」", pg.evaluate("() => TW.ai.via()"), "auto")
            reset()
            mode("rl")
            ask()
            check("auto 模式撞限流才转后端", workers() >= 1, True, "%d 次" % workers())

            # 限流退避只记 3 分钟：过期自动回直连
            reset()
            mode("ok")
            ask()
            check("退避期内不再撞直连", len(calls()), 0)
            travel(186000)
            r = ask()
            check("3 分钟后自动回直连并成功", r, "ok:OK-REPLY")
            check("回直连后打的是自定义接口", calls() and calls()[-1], API + "/chat/completions")

            # ---- 6. 跨域退避 30 分钟（auto 下后端是唯一活路，别每 3 分钟白撞一次） ----
            reset()
            mode("cors")
            ask()
            check("auto 下跨域失败转后端", workers() >= 1, True, "%d 次" % workers())
            reset()
            mode("ok")
            ask()
            check("跨域退避期内不撞直连", len(calls()), 0)
            travel(6 * 60 * 1000)
            ask()
            check("6 分钟后仍不撞直连（跨域不是限流，记 30 分钟）", len(calls()), 0)
            travel(25 * 60 * 1000)
            r = ask()
            check("超过 30 分钟后重新试直连", r, "ok:OK-REPLY")

            # ---- 7. 设置页也挂同一个开关，且读数一致 ----
            pg.goto(BASE + "#/settings", wait_until="domcontentloaded")
            pg.wait_for_selector("#set-ai-via", timeout=15000)
            check("设置页也有「连接方式」", pg.locator("#set-ai-via button").count(), 2)
            check("设置页高亮跟 #/ai 一致（此刻是 auto）",
                  pg.inner_text("#set-ai-via button.active"), "失败转后端")
            pg.click('#set-ai-via button[data-val="direct"]')
            check("设置页点直连写进配置", pg.evaluate("() => TW.ai.via()"), "direct")
            check("设置页高亮跟着走", pg.inner_text("#set-ai-via button.active"), "浏览器直连")

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
