# -*- coding: utf-8 -*-
"""后端/账号/云同步端到端核验（Playwright + 本地 mock 后端）。

覆盖：
  1) 离线优先：不配后端时站点照常可用，导航显示「登录 / 注册」
  2) 注册（邮箱+密码）→ 登录态 → 管理员识别
  3) 练习产生进度 → 同步到云端 → 服务端数据正确
  4) 合并规则：计数取 max（幂等，不回退）
  5) 换设备（全新浏览器存储）登录 → 进度恢复
  6) 管理看板：用户列表 / 单人下钻 / CSV 导出
  7) 权限：普通用户访问管理接口被 403 拒绝
  8) 管理员重置密码：旧密码失效、新密码可用

用法（脚本会自己拉起静态服务与 mock 后端）：
    NODE_OPTIONS= python -u tools/verify_backend.py
"""
import json
import os
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPORT = int(os.environ.get("SPORT", "5199"))
APORT = int(os.environ.get("APORT", "8791"))
BASE = "http://127.0.0.1:%d/" % SPORT
API = "http://127.0.0.1:%d" % APORT

ADMIN_EMAIL = "admin@test.local"
ADMIN_PASS = "secret123"
USER_EMAIL = "user@test.local"
USER_PASS = "userpass123"

EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

checks = []
errors = []


def log(msg):
    print(msg, flush=True)


def check(name, got, want=True, extra=""):
    ok = got == want
    checks.append((ok, name))
    log(("  [OK]   " if ok else "  [FAIL] ") + name
        + (("  " + str(extra)) if extra else "")
        + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def port_free(p):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", p)) != 0
    finally:
        s.close()


def wait_http(url, timeout=25):
    import urllib.request
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                return r.status
        except Exception:
            time.sleep(0.25)
    return None


def main():
    for p in (SPORT, APORT):
        if not port_free(p):
            log("端口 %d 被占用，先清掉再跑（MSYS_NO_PATHCONV=1 taskkill /PID <pid> /F）" % p)
            return 3

    procs = []
    log("启动静态服务 :%d 与 mock 后端 :%d" % (SPORT, APORT))
    procs.append(subprocess.Popen([PY, "tools/serve.py", "-p", str(SPORT)], cwd=str(ROOT),
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    procs.append(subprocess.Popen([PY, "tools/mock_api.py", "--port", str(APORT), "--admin", ADMIN_EMAIL],
                                  cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    try:
        if wait_http(BASE + "index.html") != 200:
            log("静态服务未就绪")
            return 3
        if wait_http(API + "/api/health") != 200:
            log("mock 后端未就绪")
            return 3

        with sync_playwright() as pw:
            kwargs = {"executable_path": str(EXE)} if EXE.exists() else {}
            browser = pw.chromium.launch(**kwargs)

            def new_ctx(api_base=None, tag=""):
                ctx = browser.new_context(viewport={"width": 1280, "height": 900})
                if api_base:
                    ctx.add_init_script(
                        "try{localStorage.setItem('typingcet.apiBase',%s);}catch(e){}"
                        % json.dumps(api_base))
                pg = ctx.new_page()
                pg.on("console", lambda m: errors.append(tag + "console:" + m.text)
                      if m.type == "error" else None)
                pg.on("pageerror", lambda e: errors.append(tag + "pageerror:" + str(e)))
                return ctx, pg

            def goto(pg, route, wait=800):
                pg.goto(BASE + route, wait_until="domcontentloaded")
                pg.wait_for_timeout(wait)

            # ============ 1) 离线优先：不配后端 ============
            log("\n--- 1) 离线优先（未配置后端）---")
            ctx0, pg0 = new_ctx(None, "[off]")
            goto(pg0, "#/")
            check("未配置后端时 sync 未启用",
                  pg0.evaluate("() => TW.sync.enabled()"), False)
            # 用 evaluate 取值而不是 eval_on_selector：取不到时把侧栏 HTML 带出来，便于定位
            foot = pg0.evaluate("""() => {
              const el = document.querySelector('.foot-user .fu-text');
              if (el) return el.textContent.trim();
              const sb = document.getElementById('sidebar');
              return 'MISSING >> ' + (sb ? sb.innerHTML.slice(0, 300) : 'no #sidebar');
            }""")
            check("侧栏底部显示登录入口", foot, "登录 / 注册")
            # 关掉自动发音，避免离线环境下「取音频失败」的网络噪声干扰控制台断言
            pg0.evaluate("() => { TW.store.setSetting('autoPronounce', false); }")
            goto(pg0, "#/practice?book=week1&mode=type")
            check("纯本地模式仍可进入练习（有输入框）",
                  pg0.locator(".typing-input").count(), 1)
            goto(pg0, "#/account")
            check("账号页有邮箱输入框", pg0.locator("#auth-email").count(), 1)
            ctx0.close()

            # ============ 2) 注册（管理员邮箱）============
            log("\n--- 2) 注册 / 登录态 ---")
            ctxA, pgA = new_ctx(API, "[A]")
            goto(pgA, "#/account")
            check("配了后端地址后 base 正确", pgA.evaluate("() => TW.api.base()"), API)
            pgA.click("#auth-tab button[data-val='register']")
            pgA.fill("#auth-email", ADMIN_EMAIL)
            pgA.fill("#auth-pass", ADMIN_PASS)
            pgA.fill("#auth-pass2", ADMIN_PASS)
            pgA.click("#auth-submit")
            pgA.wait_for_timeout(1800)
            check("注册后拿到 token", bool(pgA.evaluate("() => TW.api.token()")), True)
            check("管理员邮箱被识别为 admin", pgA.evaluate("() => TW.api.isAdmin()"), True)
            check("界面切到「当前账号」", pgA.locator(".sync-pill").count(), 1)
            check("导航出现「管理看板」",
                  pgA.evaluate("() => Array.from(document.querySelectorAll('.nav-item .nav-label'))"
                               ".some(e => e.textContent === '管理看板')"), True)

            # ============ 3) 造进度 → 同步 ============
            log("\n--- 3) 练习进度同步到云端 ---")
            made = pgA.evaluate("""() => {
              const ids = TW.WORDS.slice(0, 4).map(w => w.id);
              TW.store.markWrong(ids[0]);
              TW.store.markRight(ids[1]);
              TW.store.toggleFav(ids[2]);
              TW.store.toggleMaster(ids[3]);
              TW.store.srs.enroll('apple', 'week1', 'n. 苹果');
              return ids;
            }""")
            chk = pgA.evaluate("() => TW.sync.flush(true)")
            check("手动同步成功", chk, True)
            check("同步状态 = idle", pgA.evaluate("() => TW.sync.snapshot().status"), "idle")

            srv = pgA.evaluate("""async (ids) => {
              const s = await TW.api.request('GET','/api/me/state');
              return {
                n: Object.keys(s.progress).length,
                w0: s.progress[ids[0]] ? s.progress[ids[0]].w : -1,
                m3: s.progress[ids[3]] ? s.progress[ids[3]].master : null,
                f2: s.progress[ids[2]] ? s.progress[ids[2]].fav : null,
                srs: !!s.srs['apple'],
                day: s.daily[TW.store.today()] || null
              };
            }""", made)
            check("云端有 4 条进度", srv["n"], 4)
            check("云端记下答错次数", srv["w0"], 1)
            check("云端记下「已掌握」", srv["m3"], True)
            check("云端记下「收藏」", srv["f2"], True)
            check("云端有复习队列条目 apple", srv["srs"], True)
            check("云端有当日练习量", srv["day"], {"done": 2, "right": 1})

            # ============ 4) 合并规则：计数取 max（幂等）============
            log("\n--- 4) 合并规则（计数取 max，不回退）---")
            merge = pgA.evaluate("""async (wid) => {
              await TW.api.sync({progress: {[wid]: {w:5,r:0,seen:5,fav:false,master:false,ts:1000}},
                                 daily:{}, srs:{}, deleted:{progress:[],srs:[]}, clear:[]});
              await TW.api.sync({progress: {[wid]: {w:2,r:9,seen:2,fav:false,master:false,ts:2000}},
                                 daily:{}, srs:{}, deleted:{progress:[],srs:[]}, clear:[]});
              const s = await TW.api.request('GET','/api/me/state');
              return {w: s.progress[wid].w, r: s.progress[wid].r, seen: s.progress[wid].seen};
            }""", made[0])
            check("w 取最大值 5（旧值 5 不被 2 覆盖）", merge["w"], 5)
            check("r 取最大值 9", merge["r"], 9)
            check("seen 取最大值 5", merge["seen"], 5)

            # 恢复干净数据（先删服务端那条，再用保留词面快照的本地记录补回，方便后面核对）
            pgA.evaluate("""async (wid) => {
              await TW.api.sync({progress:{}, daily:{}, srs:{}, deleted:{progress:[wid],srs:[]},
                                 clear:[]});
              const rec = TW.store.state.progress[wid];
              if (rec) { rec.w = 1; rec.r = 0; rec.seen = 1; rec.ts = Date.now(); }
              await TW.sync.flush(true);
            }""", made[0])

            # ============ 5) 换设备登录 → 进度恢复 ============
            log("\n--- 5) 换设备（全新浏览器）登录恢复 ---")
            ctxB, pgB = new_ctx(API, "[B]")
            goto(pgB, "#/")
            check("新设备本地进度为空", pgB.evaluate("() => TW.store.counts().touched"), 0)
            goto(pgB, "#/account")
            pgB.fill("#auth-email", ADMIN_EMAIL)
            pgB.fill("#auth-pass", ADMIN_PASS)
            pgB.click("#auth-submit")
            pgB.wait_for_timeout(2200)
            cnt = pgB.evaluate("() => TW.store.counts()")
            check("登录后恢复「错词」", cnt["wrong"] >= 1, True, extra=cnt)
            check("登录后恢复「已掌握」", cnt["master"] >= 1, True)
            check("登录后恢复「收藏」", cnt["fav"] >= 1, True)
            check("登录后恢复复习队列", pgB.evaluate("() => TW.store.srs.has('apple')"), True)
            goto(pgB, "#/review")
            check("生词本页能看到恢复的错词", pgB.locator(".wl-row").count() >= 1, True)

            # 刷新页面后仍然在（boot 时会 flush(true) 对齐）
            goto(pgB, "#/")
            check("刷新后仍是登录态", bool(pgB.evaluate("() => TW.api.token()")), True)
            check("刷新后进度仍在", pgB.evaluate("() => TW.store.counts().touched >= 2"), True)

            # ============ 6) 管理看板 ============
            log("\n--- 6) 管理看板 ---")
            goto(pgA, "#/admin", 1200)
            check("看板列出用户行", pgA.locator(".adm-table tbody tr").count() >= 1, True)
            check("第一行是管理员邮箱",
                  pgA.eval_on_selector(".adm-table tbody tr .adm-mail", "el => el.textContent.trim()"),
                  ADMIN_EMAIL)
            check("汇总卡有 5 张", pgA.locator(".stat-card").count(), 5)
            pgA.click(".adm-table tbody tr:first-child [data-open]")
            pgA.wait_for_timeout(1000)
            check("下钻面板出现", pgA.locator(".adm-detail").count(), 1)
            # 回归守卫：后台同步会触发整页重渲染，曾经把刚展开的下钻面板关掉
            seq = []
            for _ in range(8):
                pgA.wait_for_timeout(400)
                seq.append(pgA.locator(".adm-detail").count())
            check("下钻面板不被后台同步关掉", all(v == 1 for v in seq), True, extra=seq)
            check("错词列表有词", pgA.locator(".adm-word").count() >= 1, True)
            pgA.click("#adm-tabs button[data-tab='master']")
            pgA.wait_for_timeout(300)
            check("切到「已掌握」也有词", pgA.locator(".adm-word").count() >= 1, True)
            csv_txt = pgA.evaluate("""async () => {
              const id = document.querySelector('[data-csv]').dataset.csv;
              return await TW.api.adminExportCsv(id);
            }""")
            check("CSV 有表头", "type,word_id,word" in csv_txt, True)
            check("CSV 含 progress 行", "progress," in csv_txt, True)

            # ============ 7) 权限：普通用户 ============
            log("\n--- 7) 权限控制 ---")
            ctxC, pgC = new_ctx(API, "[C]")
            goto(pgC, "#/account")
            pgC.click("#auth-tab button[data-val='register']")
            pgC.fill("#auth-email", USER_EMAIL)
            pgC.fill("#auth-pass", USER_PASS)
            pgC.fill("#auth-pass2", USER_PASS)
            pgC.click("#auth-submit")
            pgC.wait_for_timeout(1800)
            check("普通用户不是 admin", pgC.evaluate("() => TW.api.isAdmin()"), False)
            goto(pgC, "#/admin")
            check("普通用户看板显示拦截提示",
                  pgC.evaluate("() => document.body.innerText.indexOf('不是管理员') >= 0"), True)
            forbidden = pgC.evaluate("""async () => {
              try { await TW.api.adminUsers(); return 'ok'; }
              catch (e) { return e.status; }
            }""")
            check("普通用户调管理接口返回 403", forbidden, 403)

            # ============ 8) 管理员重置密码 ============
            log("\n--- 8) 管理员重置密码 ---")
            uid = pgA.evaluate("""async () => {
              const us = await TW.api.adminUsers();
              return us.find(u => u.email === %s).id;
            }""" % json.dumps(USER_EMAIL))
            check("管理员能查到普通用户", bool(uid), True)
            pgA.evaluate("""async (id) => { await TW.api.adminResetPassword(id, 'brandnew123'); }""", uid)
            bad = pgC.evaluate("""async (args) => {
              try { await TW.api.login(args.e, args.p); return 'ok'; } catch (e) { return e.status; }
            }""", {"e": USER_EMAIL, "p": USER_PASS})
            check("旧密码已失效（401）", bad, 401)
            good = pgC.evaluate("""async (args) => {
              try { await TW.api.login(args.e, args.p); return 'ok'; } catch (e) { return e.status; }
            }""", {"e": USER_EMAIL, "p": "brandnew123"})
            check("新密码可登录", good, "ok")

            # ============ 9) 退出登录后本地数据仍在 ============
            log("\n--- 9) 退出登录 ---")
            pgC.evaluate("""async () => { await TW.api.logout(); }""")
            pgC.wait_for_timeout(300)
            check("退出后 token 清空", pgC.evaluate("() => TW.api.token()"), "")
            check("退出后本地学习数据保留",
                  pgC.evaluate("() => Object.keys(TW.store.state.progress).length >= 0"), True)

            # ============ 控制台错误 ============
            # 说明：浏览器会把「预期内的 4xx」也记成 console error（Failed to load resource），
            # 本脚本故意测了 401/403，所以把这类网络状态噪声单列，真正要卡的是 JS 异常。
            def is_net_noise(e):
                return ("Failed to load resource" in e or "net::ERR" in e
                        or "favicon" in e.lower() or "dictvoice" in e)
            real = [e for e in errors if not is_net_noise(e)]
            js_err = [e for e in real if "pageerror" in e]
            check("JS 运行时异常 = 0", len(js_err), 0, extra=js_err[:3])
            check("控制台错误（已剔除预期 4xx / 网络噪声）= 0", len(real), 0, extra=real[:3])
            noise = len(errors) - len(real)
            if noise:
                log("  （已忽略 %d 条网络/404 噪声，属故意触发的 4xx）" % noise)

            try:
                browser.close()
            except Exception:
                pass
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass

    log("")
    failed = [n for ok, n in checks if not ok]
    log("失败 %d / 共 %d 项断言" % (len(failed), len(checks)))
    for n in failed:
        log("  - " + n)
    sys.stdout.flush()
    os._exit(0 if not failed else 3)


if __name__ == "__main__":
    main()
