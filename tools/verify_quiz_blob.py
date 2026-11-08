# 端到端核验「做题记录跨设备同步」。
#
# 覆盖三件事：
#   1) 设备 A 做完一组题 → 记录进了 D1 的 user_blobs；
#   2) 设备 B（干净的浏览器上下文）登录后自动拿到这条记录；
#   3) 两边各做不同的套 → 合并后互不覆盖（这是「先拉再推」的意义所在）。
#
# 用法（必须系统 Python，playwright 装在那儿）：
#   D:/workplace/python/Python/Python3.13.7/python.exe tools/verify_quiz_blob.py
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_ai_cfg_api as V          # 复用 D1 命令行 / 建账号 / pbkdf2

BASE = (os.environ.get("BASE") or "https://sunfleeting.website").rstrip("/")
KEY = "typingcet.quiz.v1"

fails = []
n = [0]


def check(name, got, want):
    n[0] += 1
    ok = got == want
    if not ok:
        fails.append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name
          + ("" if ok else "  got=%r want=%r" % (got, want)))


LOGIN = """([t, u, wipe]) => {
    localStorage.setItem('typingcet.token', t);
    localStorage.setItem('typingcet.user', JSON.stringify(u));
    if (wipe) localStorage.removeItem('%s');
}""" % KEY

SAVE = """(id) => {
    TW.quiz.saveResult(id, {right: 8, total: 10, answers: {1: 'A', 2: 'B'}, items: {1: 1, 2: 0}});
    return !!TW.quiz.result(id);
}"""

RESULT = """(id) => { var r = TW.quiz.result(id); return r ? r.right + '/' + r.total : ''; }"""


def main():
    from playwright.sync_api import sync_playwright

    email = "qzblob+%d@example.com" % int(time.time())
    password = "verify-" + uuid.uuid4().hex[:10]
    uid = str(uuid.uuid4())
    now = int(time.time() * 1000)
    print("前端：%s" % BASE)

    V.d1("INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) "
         "VALUES ('%s','%s','%s','',%d,%d,0)" % (uid, email, V.pbkdf2_hash(password), now, now))
    print("  临时账号：%s" % email)
    try:
        st, r = V.call("POST", "/api/login", {"email": email, "password": password})
        token, user = r.get("token", ""), r.get("user") or {}
        check("临时账号能登录", bool(token), True)
        if not token:
            return 1

        with sync_playwright() as p:
            br = p.chromium.launch()

            def device(wipe):
                ctx = br.new_context()
                pg = ctx.new_page()
                errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.goto(BASE, wait_until="domcontentloaded", timeout=60000)
                pg.evaluate(LOGIN, [token, user, wipe])
                pg.reload(wait_until="domcontentloaded")
                pg.wait_for_timeout(2500)          # 登录后的首轮 blob 同步
                return ctx, pg, errs

            # ---- 设备 A：做一组题 ----
            ctxA, pgA, errsA = device(True)
            check("设备A 记录已写入本机", pgA.evaluate(SAVE, "zt-e2e-1"), True)
            pgA.wait_for_timeout(3500)             # 1.5s 防抖 + 一次往返
            check("设备A 无 JS 报错", errsA, [])

            rows = V.d1("SELECT LENGTH(json) AS n, ts FROM user_blobs "
                        "WHERE user_id = '%s' AND k = '%s'" % (uid, KEY))
            row = rows[0] if rows else {}
            check("D1 里存下了这块记录", (row.get("n") or 0) > 0, True)

            # ---- 设备 B：另开一个干净上下文，登录后应当自动拿到 ----
            ctxB, pgB, errsB = device(True)
            check("设备B 自动拿到做题记录", pgB.evaluate(RESULT, "zt-e2e-1"), "8/10")
            check("设备B 无 JS 报错", errsB, [])

            # ---- 设备 B 再做另一组 → 两边各一条，互不覆盖 ----
            check("设备B 做另一组", pgB.evaluate(SAVE, "zt-e2e-2"), True)
            pgB.wait_for_timeout(3500)
            pgA.reload(wait_until="domcontentloaded")
            pgA.wait_for_timeout(2500)
            check("设备A 仍看得到自己的那组", pgA.evaluate(RESULT, "zt-e2e-1"), "8/10")
            check("设备A 也拿到了另一台做的那组", pgA.evaluate(RESULT, "zt-e2e-2"), "8/10")

            br.close()
    finally:
        V.d1("DELETE FROM users WHERE id = '%s'" % uid)
        print("  已清理临时账号")

    print()
    print("通过 %d / %d 项" % (n[0] - len(fails), n[0]))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
