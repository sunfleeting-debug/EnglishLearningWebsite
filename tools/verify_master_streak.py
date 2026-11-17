# 回归：连对 5 次必须自动「已掌握」，并且掌握后退出复习队列。
#
# 背景（2026-11-17 sunfleeting 反馈）：glamour / installment 在复习里对了十几次还是
# 反复出现、掌握程度不动。查线上 D1：r=31、master=0。根因是 streak（连对次数）是
# 纯本地字段，而 applyRemote 用云端记录**整条替换**本地记录 ⇒ 每次同步都把 streak 抹掉，
# 永远数不到 5。本脚本就是要证明「穿插同步也照样能连到 5」。
#
# 词条 id 从 CET6 词书里现取（写死 'cet6:glamour' 这种会取不到词面快照，测试自己先错）。
#
# 用法：D:/workplace/python/Python/Python3.13.7/python.exe tools/verify_master_streak.py
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_ai_cfg_api as V

BASE = (os.environ.get("BASE") or "https://sunfleeting.website").rstrip("/")
fails, n = [], [0]


def check(name, got, want):
    n[0] += 1
    ok = got == want
    if not ok:
        fails.append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name
          + ("" if ok else "  got=%r want=%r" % (got, want)))


STATE = """(id) => {
  var a = TW.store.get(id) || {};
  return {r: a.r || 0, streak: a.streak || 0, master: !!a.master, word: a.word || ''};
}"""


def main():
    from playwright.sync_api import sync_playwright

    email = "master+%d@example.com" % int(time.time())
    pw = "verify-" + uuid.uuid4().hex[:10]
    uid = str(uuid.uuid4())
    now = int(time.time() * 1000)
    print("前端：%s" % BASE)
    V.d1("INSERT INTO users (id,email,pass_hash,name,created_at,last_seen,synced_at) "
         "VALUES ('%s','%s','%s','',%d,%d,0)" % (uid, email, V.pbkdf2_hash(pw), now, now))
    try:
        st, r = V.call("POST", "/api/login", {"email": email, "password": pw})
        token, user = r.get("token", ""), r.get("user") or {}
        check("临时账号能登录", bool(token), True)
        if not token:
            return 1

        with sync_playwright() as p:
            br = p.chromium.launch()
            pg = br.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(BASE, wait_until="commit", timeout=90000)
            pg.wait_for_function("() => !!(window.TW && TW.store && TW.store.get)", timeout=90000)
            pg.evaluate("""([t,u]) => { localStorage.setItem('typingcet.token', t);
                localStorage.setItem('typingcet.user', JSON.stringify(u)); }""", [token, user])
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_timeout(1500)

            # 词书是懒加载的：先把 CET6 拉起来，才有词面快照（真实用户是练习页加载的）
            picked = pg.evaluate("""() => new Promise(function (res) {
                TW.data.loadBook('cet6', function () {
                  var l = TW.data.byBook('cet6') || [];
                  res(l.length > 2 ? [l[0].id, l[0].word, l[1].id, l[2].id, l[2].word] : []);
                });
            })""")
            check("CET6 词书能加载出词条", bool(picked), True)
            if not picked:
                br.close()
                return 1
            WID, WORD, WID2, WID3, WORD3 = picked[0], picked[1], picked[2], picked[3], picked[4]
            print("  测试词：%s（%s）" % (WID, WORD))

            # ---- 0. 先把词塞进复习队列（后面要验「掌握后自己退出队列」）----
            pg.evaluate("(w) => TW.store.srs.enroll(w, 'CET6', '测试词')", WORD)
            check("入队后出现在到期队列里", pg.evaluate(
                "(w) => TW.store.srs.dueList().some(function (x) { return x.w === w; })", WORD), True)

            # ---- 1. 连对 5 次，每次中间都让「另一个词」触发一轮同步 ----
            for i in range(5):
                pg.evaluate("(id) => TW.store.markRight(id)", WID)
                pg.evaluate("(id) => TW.store.markRight(id)", WID2)   # 制造第二次同步
                pg.wait_for_timeout(4200)      # 防抖 3.5s + 往返 + applyRemote
            s = pg.evaluate(STATE, WID)
            check("连对 5 次后 master = true", s["master"], True)
            check("连对次数 = 5（没被同步抹掉）", s["streak"], 5)
            check("答对次数 = 5", s["r"], 5)
            check("进度里存下了词面快照", s["word"], WORD)

            # 等最后一轮同步真的落库（防抖 3.5s 之外再强制推一次，避免断言跑在请求前面）
            pg.evaluate("""() => (TW.sync.flush(true) || Promise.resolve())""")
            pg.wait_for_timeout(1200)

            rows = V.d1("SELECT master, streak FROM progress WHERE user_id='%s' "
                        "AND word_id='%s'" % (uid, WID.replace("'", "''")))
            row = rows[0] if rows else {}
            check("云端也记为已掌握", row.get("master"), 1)
            check("云端也存了连对次数", row.get("streak"), 5)

            # ---- 2. 已掌握的词退出复习队列 ----
            check("已掌握 ⇒ 不在到期队列里", pg.evaluate(
                "(w) => TW.store.srs.dueList().some(function (x) { return x.w === w; })", WORD), False)

            # ---- 3. 答错清零连对（但不能把已掌握改回来） ----
            pg.evaluate("(id) => TW.store.markWrong(id)", WID)
            s = pg.evaluate(STATE, WID)
            check("答错后连对归零", s["streak"], 0)
            check("答错不影响已掌握标记", s["master"], True)

            # ---- 4. 复习满档也算掌握（满档却显示未掌握自相矛盾）----
            pg.evaluate("""(w) => {
                TW.store.srs.enroll(w, 'CET6', '满档词');
                var r = TW.store.state.srs[String(w).toLowerCase()];
                r.b = TW.store.srs.INTERVALS.length;
                TW.store.save();
            }""", WORD3)
            pg.evaluate("(id) => TW.store.markRight(id)", WID3)
            check("满档的词答对一次即自动掌握",
                  pg.evaluate("(id) => !!(TW.store.get(id) || {}).master", WID3), True)

            check("全程无 JS 报错", errs, [])
            br.close()
    finally:
        V.d1("DELETE FROM users WHERE id = '%s'" % uid)
        print("  已清理临时账号")

    print()
    print("通过 %d / %d 项" % (n[0] - len(fails), n[0]))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
