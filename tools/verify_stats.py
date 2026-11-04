# -*- coding: utf-8 -*-
"""学习统计 / 生词本 / 分页 / 复习节奏 的端到端核验（Playwright）。

对应 sunfleeting 2026-11-04 提的四件事：
  A) 学习统计「近期场次正确率」每一条要能点开看具体答题情况（哪几个词错了）
  B) 生词本要有「最近学过」，时间范围 1 小时 / 1 天 / 3 天 / 1 周 / 1 月，按离现在最近排序
  C) 分页别只有上一页/下一页：要能直接跳最后一页，也要能输入页码跳转
  D) 错题复习机制：同一个词不该「每一轮复习都出现」
     —— 现在的规则是「答错当天再练一次，当天再错就顺延到明天」

用法（脚本会自己拉起静态服务）：
    NODE_OPTIONS= python -u tools/verify_stats.py
"""
import os
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "5198"))
BASE = "http://127.0.0.1:%d/" % PORT

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
    if not port_free(PORT):
        log("端口 %d 被占用，先换一个 PORT" % PORT)
        return 3

    procs = []
    log("启动静态服务 :%d" % PORT)
    procs.append(subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=str(ROOT),
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    try:
        if wait_http(BASE + "index.html") != 200:
            log("静态服务未就绪")
            return 3

        with sync_playwright() as pw:
            browser = pw.chromium.launch(**({"executable_path": str(EXE)} if EXE.exists() else {}))
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            pg = ctx.new_page()
            pg.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
            pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            pg.goto(BASE + "#/home", wait_until="domcontentloaded")
            pg.wait_for_function("() => window.TW && TW.store && TW.data && TW.data.words")
            pg.wait_for_timeout(400)

            # ---------- 造数据：4 个不同时间的已学词 + 3 场带明细的场次 ----------
            pg.evaluate("""() => {
                TW.store.resetAll();
                const S = TW.store;
                const now = Date.now();
                const marks = [2 * 60 * 1000, 2 * 3600 * 1000, 2 * 86400 * 1000, 10 * 86400 * 1000];
                const ws = TW.data.words.slice(0, 4);
                ws.forEach((w, i) => {
                    const p = S.state.progress[w.id] = S.state.progress[w.id] || {};
                    p.w = i === 0 ? 2 : 0; p.r = 3; p.seen = 5; p.fav = false; p.master = false;
                    p.ts = now - marks[i]; p.word = w.word; p.src = w.book || '';
                    p.brief = TW.data.brief(w); p.streak = 0;
                });
                // 三场：最新一场带明细（错2对1），第二场带明细（全对），第三场是老数据（没有 detail）
                S.addSession({ t: now - 600000, mode: 'listen', src: 'srs', total: 3, right: 1, wrong: 2, acc: 33,
                    detail: [
                        { id: ws[0].id, word: ws[0].word, ok: 0 },
                        { id: ws[1].id, word: ws[1].word, ok: 0 },
                        { id: ws[2].id, word: ws[2].word, ok: 1 }
                    ] });
                S.addSession({ t: now - 1800000, mode: 'type', src: 'book', total: 2, right: 2, wrong: 0, acc: 100,
                    detail: [
                        { id: ws[2].id, word: ws[2].word, ok: 1 },
                        { id: ws[3].id, word: ws[3].word, ok: 1 }
                    ] });
                S.addSession({ t: now - 86400000 * 3, mode: 'card', src: 'book', total: 4, right: 2, wrong: 2, acc: 50 });
                S.save();
            }""")
            pg.wait_for_timeout(300)

            # ---------- A. 统计页场次可点开 ----------
            log("A) 学习统计 → 场次明细")
            pg.goto(BASE + "#/stats", wait_until="domcontentloaded")
            pg.wait_for_selector(".sess-row", timeout=8000)
            pg.wait_for_timeout(300)

            check("场次行数 = 3", pg.locator(".sess-row").count(), 3)
            check("明细面板默认收起", pg.locator(".sess-detail:not([hidden])").count(), 0)

            pg.locator(".sess-row").first.click()
            pg.wait_for_timeout(200)
            check("点开一场后出现明细面板", pg.locator(".sess-detail:not([hidden])").count(), 1)
            check("明细里 3 个词", pg.locator(".sess-detail:not([hidden]) .sd-chip").count(), 3)
            check("明细先列错词", pg.locator(".sess-detail:not([hidden]) .sd-chip").first.get_attribute("class"),
                  "sd-chip err")
            check("明细统计：错 2 对 1",
                  pg.evaluate("() => document.querySelector('.sess-detail:not([hidden]) .sd-n-err').textContent") == "2"
                  and pg.evaluate("() => document.querySelector('.sess-detail:not([hidden]) .sd-n-ok').textContent") == "1")
            check("明细里的词能进详解",
                  pg.locator(".sess-detail:not([hidden]) a.sd-chip").count() >= 1)

            pg.locator(".sess-row").first.click()
            pg.wait_for_timeout(150)
            check("再点一次收起", pg.locator(".sess-detail:not([hidden])").count(), 0)

            # 老场次（没有 detail）老实说没有明细
            pg.locator(".sess-row").nth(2).click()
            pg.wait_for_timeout(200)
            check("老场次点开也有面板", pg.locator(".sess-detail:not([hidden])").count(), 1)
            check("老场次提示没有明细",
                  "没有记录明细" in pg.evaluate(
                      "() => document.querySelector('.sess-detail:not([hidden])').textContent"))

            # ---------- B. 生词本「最近学过」 ----------
            log("B) 生词本 → 最近学过 + 时间范围")
            pg.goto(BASE + "#/review?tab=recent", wait_until="domcontentloaded")
            pg.wait_for_selector("#rv-list", timeout=8000)
            pg.wait_for_timeout(300)

            check("有「最近学过」标签", pg.evaluate(
                "() => [...document.querySelectorAll('#rv-tabs button')].some(b => b.textContent.includes('最近学过'))"))
            check("默认 3 天范围", pg.evaluate(
                "() => (document.querySelector('#rv-range .active') || {}).dataset ? document.querySelector('#rv-range .active').dataset.range : ''") == "3d")
            check("默认范围内 3 个词（2 分钟 / 2 小时 / 2 天）", pg.locator("#rv-list .wl-row").count(), 3)

            def words():
                return pg.evaluate("() => [...document.querySelectorAll('#rv-list .wl-word a')].map(a => a.textContent.trim())")

            ws = words()
            order = pg.evaluate("""() => {
                const ids = TW.data.words.slice(0, 4).map(w => String(w.id));
                return ids;
            }""")
            check("按离现在最近排序（最近学的排第一）",
                  ws[0] == pg.evaluate("() => TW.data.words[0].word") and ws[-1] == pg.evaluate("() => TW.data.words[2].word"),
                  extra=ws)
            check("时间标签显示相对时间", pg.evaluate(
                "() => [...document.querySelectorAll('#rv-list .tag')].some(t => /分钟前|小时前|天前|刚刚/.test(t.textContent))"))

            pg.click("#rv-range [data-range='1h']")
            pg.wait_for_timeout(500)
            check("切到 1 小时只剩 1 个", pg.locator("#rv-list .wl-row").count(), 1)
            check("范围带在 URL 里", "range=1h" in pg.evaluate("() => location.hash"))

            pg.click("#rv-range [data-range='30d']")
            pg.wait_for_timeout(500)
            check("切到 1 个月能看到 4 个", pg.locator("#rv-list .wl-row").count(), 4)

            pg.click("#rv-practice-top")
            pg.wait_for_timeout(700)
            check("练习这组带着范围走", "status=recent" in pg.evaluate("() => location.hash")
                  and "range=30d" in pg.evaluate("() => location.hash"),
                  extra=pg.evaluate("() => location.hash"))

            # ---------- C. 分页：末页 + 页码跳转 ----------
            log("C) 分页 → 末页 / 输入页码")
            pg.goto(BASE + "#/books?book=all", wait_until="domcontentloaded")
            pg.wait_for_selector("#books-body .pager", timeout=10000)
            pg.wait_for_timeout(300)

            total_pages = pg.evaluate("""() => {
                const t = document.querySelector('.pager .pg-info').textContent;
                return parseInt(t.split('/')[1], 10);
            }""")
            check("词库不止一页", total_pages > 1, extra=total_pages)
            check("有「末页」按钮", pg.locator(".pager [data-pg='last']").count(), 1)
            check("有页码输入框", pg.locator(".pager [data-pgin]").count(), 1)

            pg.click(".pager [data-pg='last']")
            pg.wait_for_timeout(500)
            check("点末页到最后一页",
                  pg.evaluate("() => parseInt(document.querySelector('.pager .pg-info').textContent.split('/')[0], 10)")
                  == total_pages)
            check("末页按钮在最后一页是禁用的",
                  pg.evaluate("() => document.querySelector(\".pager [data-pg='last']\").disabled"))
            check("URL 带上了 page", ("page=%d" % total_pages) in pg.evaluate("() => location.hash"))

            pg.fill(".pager [data-pgin]", "2")
            pg.click(".pager [data-pgjump]")
            pg.wait_for_timeout(500)
            check("输入页码 + 跳转 = 第 2 页",
                  pg.evaluate("() => parseInt(document.querySelector('.pager .pg-info').textContent.split('/')[0], 10)") == 2)

            # 回车也能跳 + 越界夹取
            pg.fill(".pager [data-pgin]", "999")
            pg.press(".pager [data-pgin]", "Enter")
            pg.wait_for_timeout(500)
            check("页码越界夹到最后一页",
                  pg.evaluate("() => parseInt(document.querySelector('.pager .pg-info').textContent.split('/')[0], 10)")
                  == total_pages)

            pg.fill(".pager [data-pgin]", "0")
            pg.press(".pager [data-pgin]", "Enter")
            pg.wait_for_timeout(500)
            check("页码 0 夹到第 1 页",
                  pg.evaluate("() => parseInt(document.querySelector('.pager .pg-info').textContent.split('/')[0], 10)") == 1)

            # 生词本的分页也用同一套控件
            pg.goto(BASE + "#/review?tab=learned", wait_until="domcontentloaded")
            pg.wait_for_timeout(400)
            check("生词本也有末页/跳转",
                  pg.locator(".pager [data-pg='last']").count() + pg.locator(".pager [data-pgin]").count() == 2)

            # ---------- D. 复习节奏：当天最多出现两次 ----------
            log("D) 复习队列：答错当天再练一次，再错顺延明天")
            res = pg.evaluate("""() => {
                const S = TW.store;
                const today = S.today();
                S.resetAll();
                const w = 'enroll';
                S.srs.enroll(w, 'book1', 'v. 登记');
                // 第一次答错：入队当天 → 今天到期
                S.srs.onResult(w, false, 'book1', 'v. 登记');
                const d1 = S.state.srs[w].d;
                // 当天第二次答错：已经补练过 → 顺延到明天
                S.srs.onResult(w, false, 'book1', 'v. 登记');
                const d2 = S.state.srs[w].d;
                return { today, d1, d2, due: S.srs.dueList().map(r => r.w) };
            }""")
            check("第一次答错 → 今天到期", res["d1"] == res["today"], extra=res["d1"])
            check("当天再错 → 顺延到明天", res["d2"] > res["today"], extra=res["d2"])
            check("顺延后不再出现在今天队列", res["due"] == [], extra=res["due"])

            # 答对则正常升档。🔴 2026-11-04 起间隔是 今天/1/2/3/4/6/7/10 天：
            # 第 1 档落在「今天」（当天再巩固一次），第 2 档才是 +1 天。
            res2 = pg.evaluate("""() => {
                const S = TW.store;
                S.resetAll();
                S.srs.enroll('enroll', 'book1', 'v. 登记');
                S.srs.onResult('enroll', true, 'book1', 'v. 登记');
                const r1 = JSON.parse(JSON.stringify(S.state.srs['enroll']));
                S.srs.onResult('enroll', true, 'book1', 'v. 登记');
                const r2 = JSON.parse(JSON.stringify(S.state.srs['enroll']));
                S.srs.onResult('enroll', true, 'book1', 'v. 登记');
                const r3 = JSON.parse(JSON.stringify(S.state.srs['enroll']));
                return { b1: r1.b, d1: r1.d, b2: r2.b, d2: r2.d, b3: r3.b, d3: r3.d,
                         today: S.today(), iv: S.srs.INTERVALS.slice() };
            }""")
            check("间隔表 = 今天/1/2/3/4/6/7/10",
                  res2["iv"] == [0, 1, 2, 3, 4, 6, 7, 10], extra=res2["iv"])
            check("第 1 次答对 → 第 1 档、今天再来",
                  res2["b1"] == 1 and res2["d1"] == res2["today"], extra=res2)
            check("第 2 次答对 → 第 2 档、明天",
                  res2["b2"] == 2 and res2["d2"] > res2["today"], extra=res2)
            check("第 3 次答对 → 第 3 档、更远",
                  res2["b3"] == 3 and res2["d3"] > res2["d2"], extra=res2)

            check("无 JS 报错", len(errors) == 0, extra=errors[:3])
            browser.close()
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
