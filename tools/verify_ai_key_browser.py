# 端到端核验「Key 从浏览器存进云端、换设备登录自动取回」。
#
# 为什么要这一条：verify_ai_cfg_api.py 用 Python 直接打 HTTP，绕过了浏览器的
# CORS 预检 —— 2026-11-08 的故障恰恰是「服务端全对、浏览器发不出去」（CORS 少了 PUT），
# 那种情况下 Python 测试 15/15 全绿，用户手机上却还得重新填 Key。所以这条用真 Chromium
# 从站点 origin 发起请求，并把「第二台设备」也用独立 context 真跑一遍。
#
# 用法（必须系统 Python，playwright 装在那儿）：
#   D:/workplace/python/Python/Python3.13.7/python.exe tools/verify_ai_key_browser.py
#   BASE=https://sunfleeting.website python tools/verify_ai_key_browser.py
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_ai_cfg_api as V          # 复用 D1 命令行 / 建账号 / pbkdf2

BASE = (os.environ.get("BASE") or "https://sunfleeting.website").rstrip("/")
fails = []
n = [0]


def check(name, got, want):
    n[0] += 1
    ok = got == want
    if not ok:
        fails.append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name
          + ("" if ok else "  got=%r want=%r" % (got, want)))


def main():
    from playwright.sync_api import sync_playwright

    email = "aikey+%d@example.com" % int(time.time())
    password = "verify-" + uuid.uuid4().hex[:10]
    uid = str(uuid.uuid4())
    now = int(time.time() * 1000)
    secret = "sk-browser-e2e-" + uuid.uuid4().hex[:10]

    print("前端：%s" % BASE)
    V.d1("INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) "
         "VALUES ('%s','%s','%s','',%d,%d,0)" % (uid, email, V.pbkdf2_hash(password), now, now))
    print("  临时账号：%s" % email)
    try:
        st, r = V.call("POST", "/api/login", {"email": email, "password": password})
        token = r.get("token", "")
        check("临时账号能登录", bool(token), True)
        if not token:
            return 1
        user = r.get("user") or {}

        with sync_playwright() as p:
            br = p.chromium.launch()

            # ---- 设备 A：已登录 → 填 Key → 应当自动上云 ----
            ctxA = br.new_context()
            pgA = ctxA.new_page()
            errs = []
            pgA.on("pageerror", lambda e: errs.append(str(e)))
            pgA.goto(BASE, wait_until="domcontentloaded", timeout=60000)
            pgA.evaluate("""([t, u]) => {
                localStorage.setItem('typingcet.token', t);
                localStorage.setItem('typingcet.user', JSON.stringify(u));
            }""", [token, user])
            pgA.reload(wait_until="domcontentloaded")
            check("设备A 认出了登录态", bool(pgA.evaluate("TW.api.token()")), True)

            # 先停在配置页（此刻还没 Key，配置卡一定在），再填 Key —— 这样才能看到状态行实时更新。
            # 注意顺序别反：填完 Key 后 configured() 为真，页面直接进聊天页，配置卡根本不渲染。
            pgA.evaluate("() => { location.hash = '#/ai'; }")
            pgA.wait_for_timeout(600)

            pgA.evaluate("(s) => { TW.ai.setKey(s); }", secret)
            pgA.wait_for_timeout(3000)          # 1.2s 防抖 + 一次往返
            check("设备A 云端状态 = ok", pgA.evaluate("TW.ai.cloudStatus().state"), "ok")
            # 状态行要真出现在页面上（否则又是「静默成功/静默失败」）
            line = pgA.evaluate("() => { var el = document.querySelector('#ai-cloud'); return el ? el.textContent : ''; }")
            check("设备A 页面状态行显示已保存", "已加密保存" in (line or ""), True)
            check("设备A 无 JS 报错", errs, [])

            # ---- 直接读 D1：确认真存进去了、且是密文 ----
            rows = V.d1("SELECT LENGTH(ai_cfg) AS n, ai_cfg_at, ai_cfg FROM users WHERE id = '%s'" % uid)
            row = rows[0] if rows else {}
            check("库里 ai_cfg 非空", (row.get("n") or 0) > 0, True)
            blob = row.get("ai_cfg") or ""
            check("库里不含明文 Key", secret in blob, False)
            check("形如 <ivB64>.<ctB64>", bool(__import__("re").match(r"^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$", blob)), True)

            # ---- 设备 B：只登录、本机什么都没有 → 应当自动取回 ----
            ctxB = br.new_context()
            pgB = ctxB.new_page()
            pgB.goto(BASE, wait_until="domcontentloaded", timeout=60000)
            pgB.evaluate("""([t, u]) => {
                localStorage.setItem('typingcet.token', t);
                localStorage.setItem('typingcet.user', JSON.stringify(u));
                localStorage.removeItem('typingcet.ai.v1');
            }""", [token, user])
            pgB.reload(wait_until="domcontentloaded")
            pgB.wait_for_timeout(2500)
            check("设备B 自动拿到 Key", pgB.evaluate("TW.ai.apiKey()"), secret)
            check("设备B 状态 = ok", pgB.evaluate("TW.ai.cloudStatus().state"), "ok")

            br.close()
    finally:
        V.d1("DELETE FROM users WHERE id = '%s'" % uid)
        print("  已清理临时账号")

    print()
    print(("通过 %d / %d 项" % (n[0] - len(fails), n[0])))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
