# -*- coding: utf-8 -*-
"""本地核验：逐页截图 + 控制台错误收集 + 关键交互断言。

用法：
    NODE_OPTIONS= python -u tools/verify_site.py
前提：已在 5173 端口起好静态服务（本仓库自带 Range 支持的服务）：
    python tools/serve.py 5173
（不要用 python -m http.server，它不支持 Range，音频拖动会失败）
"""
import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "shots"
LOG = SHOTS / "verify.log"

EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")

errors = []
checks = []


def log(msg):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)


def check(name, got, want=True, extra=""):
    ok = got == want
    checks.append(ok)
    log(("  [OK]   " if ok else "  [FAIL] ") + name
        + (("  " + str(extra)) if extra else "")
        + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    LOG.write_text("", encoding="utf-8")   # 覆盖旧日志，靠 mtime 判断新鲜度

    with sync_playwright() as pw:
        kwargs = {}
        if EXE.exists():
            kwargs["executable_path"] = str(EXE)
        browser = pw.chromium.launch(**kwargs)
        pg = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        pg.on("console", lambda m: errors.append("console:" + m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

        def goto(route, wait=900):
            pg.goto(BASE + route, wait_until="domcontentloaded")
            pg.wait_for_timeout(wait)

        def goto_fresh(route, wait=900):
            """SPA 下 hash 与当前相同时 goto 不触发 hashchange、不会重渲染；
            需要「重新开始一个场景」时先绕回家，再进目标路由。"""
            if pg.evaluate("() => location.hash") == route:
                pg.evaluate("() => { location.hash = '/'; }")
                pg.wait_for_timeout(250)
            pg.goto(BASE + route, wait_until="domcontentloaded")
            pg.wait_for_timeout(wait)

        # ---------- 各页面截图 ----------
        pages = [
            ("01-home", "#/"),
            ("02-books", "#/books"),
            ("03-books-week1", "#/books?book=week1"),
            ("04-practice-type", "#/practice?book=week1&mode=type"),
            ("05-practice-recall", "#/practice?book=week1&mode=recall"),
            ("06-practice-listen", "#/practice?book=week1&mode=listen"),
            ("07-practice-flash", "#/practice?book=week1&mode=flash"),
            ("08-review", "#/review"),
            ("09-audio", "#/audio"),
            ("10-stats", "#/stats"),
            ("11-resources", "#/resources"),
            ("11b-reading", "#/reading"),
            ("11c-reading-card", "#/reading?tab=practice&test=mt1&mode=card"),
            ("12-settings", "#/settings"),
        ]
        for name, route in pages:
            goto(route)
            pg.screenshot(path=str(SHOTS / (name + ".png")))
            log("[shot] " + name + "  (" + route + ")")

        # ---------- 数据层断言 ----------
        goto("#/")
        n_words = pg.evaluate("() => TW.WORDS.length")
        n_books = pg.evaluate("() => TW.BOOKS.length")
        n_missing = pg.evaluate("() => TW.WORDS.filter(w => !w.trans || !w.trans.length).length")
        check("词条总数 = 2714", n_words, 2714)
        check("词书数量 = 9", n_books, 9)
        check("缺释义词条 = 0", n_missing, 0)
        total_count = pg.evaluate("() => TW.BOOKS.reduce((a,b)=>a+b.count,0)")
        check("各书 count 之和 = 2714", total_count, 2714)

        # ---------- 导航 ----------
        goto("#/")
        nav_n = pg.locator(".nav-item").count()
        check("侧边导航项 >= 8", nav_n >= 8, True)

        # ---------- 主题切换 ----------
        goto("#/")
        cur_dark = pg.evaluate("() => document.documentElement.classList.contains('dark')")
        pg.click("#theme-btn")
        pg.wait_for_timeout(400)
        new_dark = pg.evaluate("() => document.documentElement.classList.contains('dark')")
        check("主题切换生效", new_dark != cur_dark, True)
        pg.screenshot(path=str(SHOTS / "13-dark-home.png"))
        pg.click("#theme-btn")   # 切回浅色
        pg.wait_for_timeout(300)

        # ---------- 练习：看词打字，答对 ----------
        goto("#/practice?book=week1&mode=type&size=10")
        word = pg.evaluate("() => TW.$('#p-word').textContent.trim()")
        check("练习页显示了单词", bool(word), True)
        pg.fill("#p-input", word)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(500)
        feedback = pg.evaluate("() => document.body.innerText")
        check("答对后出现「正确」提示", "正确" in feedback, True)
        pg.screenshot(path=str(SHOTS / "14-practice-correct.png"))
        # 等自动跳转（autoNext 延迟 750ms）走完再读进度
        pg.wait_for_timeout(1300)
        pos_txt = pg.evaluate("() => TW.$('#p-pos').textContent")
        check("进度已推进到第 2 词", "第 2 " in pos_txt, True)

        # ---------- 练习：答错先给一次重做机会，再错才判错 ----------
        goto("#/practice?book=week1&mode=recall&size=10")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(500)
        t1 = pg.evaluate("() => document.body.innerText")
        check("第一次答错只提示重做、不揭答案", ("再试一次" in t1 and "答错" not in t1), True)
        check("重做时输入框仍在（未进入反馈态）", pg.locator("#p-input").count(), 1)
        check("第一次答错不改判（正确率仍为「开始吧」）",
              pg.evaluate("() => TW.$('#p-acc').textContent"), "开始吧")
        check("输入框已清空待重打", pg.evaluate("() => TW.$('#p-input').value"), "")
        pg.screenshot(path=str(SHOTS / "15-practice-retry.png"))

        # 重做仍错 → 这次才判错并给出正确答案
        pg.fill("#p-input", "yyyyyy")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(500)
        t2 = pg.evaluate("() => document.body.innerText")
        check("重做仍错才判错并给出正确答案", ("答错" in t2), True)
        pg.screenshot(path=str(SHOTS / "15-practice-wrong.png"))

        # 「看答案」= 放弃重做，直接判错
        goto_fresh("#/practice?book=week1&mode=recall&size=10")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(400)
        pg.locator("[data-act='giveup']").click()
        pg.wait_for_timeout(400)
        check("点「看答案」直接判错并揭示答案",
              "答错" in pg.evaluate("() => document.body.innerText"), True)

        # 重做答对 → 正常计入答对
        goto_fresh("#/practice?book=week1&mode=type&size=10")
        w_retry = pg.evaluate("() => TW.$('#p-word').textContent.trim()")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(400)
        check("看词打字答错也先给重做机会",
              "再试一次" in pg.evaluate("() => document.body.innerText"), True)
        pg.fill("#p-input", w_retry)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(600)
        check("重做答对后判为「正确」",
              "正确" in pg.evaluate("() => document.body.innerText"), True)

        # ---------- 练习：翻卡模式翻面后应有词典详解入口 ----------
        goto_fresh("#/practice?book=week1&mode=flash&size=10")
        pg.wait_for_timeout(600)
        # 先确认真的渲染成了翻卡页：否则下面的 count==0 断言在「空白页」上也会假通过
        # （旧实例的 autoNext 定时器曾把新页面覆盖掉，就是这一条抓出来的）
        check("翻卡页渲染出卡片（未被上一会话覆盖）", pg.locator("#p-card").count(), 1)
        check("翻卡未翻面时不显示详解入口",
              pg.locator(".practice-actions a[href^='#/word']").count(), 0)
        pg.click("[data-act='reveal']")
        pg.wait_for_timeout(500)
        check("翻卡翻面后出现「详解」入口",
              pg.locator(".practice-actions a[href^='#/word']").count() > 0, True)
        pg.screenshot(path=str(SHOTS / "26-practice-flash-detail.png"))
        pg.locator(".practice-actions a[href^='#/word']").first.click()
        pg.wait_for_timeout(800)
        check("翻卡「详解」可进入详情页", "#/word" in pg.evaluate("() => location.hash"), True)

        # ---------- 收藏 + localStorage 持久化 ----------
        pg.evaluate("() => localStorage.clear()")
        goto("#/books?book=week1")
        pg.locator(".star-btn[data-act='fav']").first.click()
        pg.wait_for_timeout(400)
        fav_n = pg.evaluate("() => Object.values(TW.store.state.progress).filter(p=>p.fav).length")
        check("收藏写入 state", fav_n, 1)
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_timeout(800)
        fav_n2 = pg.evaluate("() => Object.values(TW.store.state.progress).filter(p=>p.fav).length")
        check("刷新后收藏仍在（localStorage 生效）", fav_n2, 1)

        # ---------- 搜索 ----------
        goto("#/books")
        pg.fill("#bk-search", "abbreviation")
        pg.wait_for_timeout(700)
        rows = pg.evaluate("() => document.querySelectorAll('#bk-list .wl-row').length")
        check("搜索命中 1 条", rows, 1)

        # ---------- 生词本分组 ----------
        goto("#/review?tab=wrong")
        wrong_rows = pg.evaluate("() => document.querySelectorAll('#rv-list .wl-row').length")
        check("错词本有序（>=1）", wrong_rows >= 1, True)
        pg.screenshot(path=str(SHOTS / "16-review-wrong.png"))

        # ---------- 音频页 ----------
        goto("#/audio", 1200)
        audio_src = pg.evaluate("() => TW.$('#au-audio').getAttribute('src')")
        check("音频已挂载 src", bool(audio_src), True)
        lyric_n = pg.evaluate("() => document.querySelectorAll('.lyric-item').length")
        check("字幕行加载 = 250", lyric_n, 250)
        # 等音频元数据就绪（readyState>=1）后再点击字幕
        for _ in range(40):
            if pg.evaluate("() => TW.$('#au-audio').readyState >= 1"):
                break
            pg.wait_for_timeout(250)
        check("音频元数据已就绪", pg.evaluate("() => TW.$('#au-audio').readyState >= 1"), True)
        pg.locator(".lyric-item").nth(9).click()
        pg.wait_for_timeout(1200)
        cur_time = pg.evaluate("() => TW.$('#au-audio').currentTime")
        check("点击字幕跳转了音频进度（>30s）", cur_time > 30, True)
        active_n = pg.evaluate("() => document.querySelectorAll('.lyric-item.active').length")
        check("当前字幕被高亮", active_n >= 1, True)

        # ---------- 词典卡：首屏按需加载 ----------
        goto("#/")
        boot_dict = pg.evaluate("() => !!(window.TW.data && TW.data.dictReady())")
        check("首屏不加载词典卡（按需加载）", boot_dict, False)
        dr_id = pg.evaluate("() => (TW.WORDS.find(w => w.word === 'drastic') || {}).id")
        check("drastic 在词库中", bool(dr_id), True)

        # 静态服务完整性：大文件必须原样下发。
        # 背景：serve.py 曾在 keep-alive 下把上一次 Range 请求的长度残留给下一个普通请求，
        # 导致 dict.js 响应 200 但内容被截断（详情页因此空白）。这里做字节级兜底核验。
        for _f in ("data/dict.js", "data/dict-ext.js", "data/words.js"):
            _local = (ROOT / _f).stat().st_size
            _served = len(pg.request.get(BASE + _f).body())
            check("原样下发 " + _f, _served == _local, True,
                  "server=%d local=%d" % (_served, _local))

        # ---------- 单词详情页（打开时触发按需加载）----------
        pg.goto(BASE + "#/word?id=" + str(dr_id), wait_until="domcontentloaded")
        try:
            pg.wait_for_selector(".dc-word", timeout=20000)
        except Exception:
            pass
        pg.wait_for_timeout(400)
        check("词典卡已按需加载", pg.evaluate("() => TW.data.dictReady()"), True)
        check("扩展词条已按需加载", pg.evaluate("() => TW.data.extReady()"), True)
        dict_n = pg.evaluate("() => Object.keys(TW.DICT || {}).length")
        check("词典卡数量 >= 2000", dict_n >= 2000, True)
        pg.screenshot(path=str(SHOTS / "19-word-detail.png"))
        detail_word = pg.evaluate("() => (TW.$('.dc-word') || {}).textContent")
        check("详情页显示单词", (detail_word or "").strip(), "drastic")
        sec_titles = pg.evaluate("() => Array.from(document.querySelectorAll('.dc-sec-title span')).map(x=>x.textContent)")
        check("详情页含「近义词」板块", "近义词" in sec_titles, True)
        check("详情页含「经典例句」板块", "经典例句" in sec_titles, True)
        ex_n = pg.evaluate("() => document.querySelectorAll('.dc-ex li').length")
        check("例句取 3 句", ex_n, 3)
        # 例句中单词渲染成链接
        ex_links = pg.evaluate("() => document.querySelectorAll('.dc-ex-en .wref').length")
        check("例句内有可跳转单词链接", ex_links >= 1, True)
        # 近义词链接可跳转
        syn_link = pg.locator(".dc-synwords .wref").first
        has_syn_link = syn_link.count() > 0
        check("近义词渲染为可跳转链接", has_syn_link, True)
        if has_syn_link:
            target = syn_link.get_attribute("href")
            syn_link.click()
            pg.wait_for_timeout(600)
            href_now = pg.evaluate("() => location.hash")
            check("点击近义词已跳转", "#/word" in href_now and href_now == target.replace("#", "#"), True)

        # 有道没有反义词的词也不应报错；找一个有反义词的词看板块
        goto("#/")
        ant_word = pg.evaluate("() => { for (var k in TW.DICT) { if (TW.DICT[k].ant && TW.DICT[k].ant.length) return k; } return ''; }")
        if ant_word:
            aw_id = pg.evaluate("(w) => (TW.WORDS.find(x => x.word.toLowerCase() === w) || {}).id", ant_word)
            if aw_id:
                goto("#/word?id=" + str(aw_id))
                ant_titles = pg.evaluate("() => Array.from(document.querySelectorAll('.dc-sec-title span')).map(x=>x.textContent)")
                check("含反义词的词显示「反义词」板块", "反义词" in ant_titles, True)
                pg.screenshot(path=str(SHOTS / "20-word-antonym.png"))

        # 词库行右侧操作图标齐全（发音 / 详解 / 收藏 / 掌握）——图标缺失会让用户找不到入口
        goto("#/books?book=week1")
        side_btns = pg.evaluate("() => document.querySelectorAll('#bk-list .wl-row:first-child .wl-side > *').length")
        check("行右侧有 4 个操作图标（发音/详解/收藏/掌握）", side_btns, 4)

        # 从词库列表进入详情页：单词文本 / 行空白都应可点进详情，右侧喇叭只发音不跳转
        goto("#/books?book=week1")
        pg.locator("#bk-list .wl-row .wl-link").first.click()
        pg.wait_for_timeout(700)
        check("点击单词文本可进入详情页", "#/word" in pg.evaluate("() => location.hash"), True)

        goto("#/books?book=week1")
        pg.locator("#bk-list .wl-row .wl-trans").first.click()
        pg.wait_for_timeout(700)
        check("点击整行（释义区）也可进入详情页", "#/word" in pg.evaluate("() => location.hash"), True)

        goto("#/books?book=week1")
        hash_before = pg.evaluate("() => location.hash")
        pg.locator("#bk-list .star-btn[data-act='speak']").first.click()
        pg.wait_for_timeout(700)
        check("点右侧发音按钮不跳转（仍留在词库页）", pg.evaluate("() => location.hash"), hash_before)

        # ---------- 移动端视口 ----------
        pg.set_viewport_size({"width": 390, "height": 844})
        goto("#/")
        pg.wait_for_timeout(600)
        pg.screenshot(path=str(SHOTS / "17-mobile-home.png"))
        goto("#/practice?book=week1&mode=type")
        pg.wait_for_timeout(400)
        pg.screenshot(path=str(SHOTS / "18-mobile-practice.png"))
        # 底部导航是否显示、横向是否溢出
        overflow = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check("移动端无横向溢出", overflow <= 1, True)

        # 移动端：单词详情页
        pg.goto(BASE + "#/word?id=" + str(dr_id), wait_until="domcontentloaded")
        try:
            pg.wait_for_selector(".dc-word", timeout=20000)
        except Exception:
            pass
        pg.wait_for_timeout(700)
        pg.screenshot(path=str(SHOTS / "21-mobile-word.png"), full_page=True)
        dc_ovf = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        check("移动端详情页无横向溢出", dc_ovf <= 1, True)

        # ---------- 移动端资源：manifest / 图标 ----------
        pg.set_viewport_size({"width": 1440, "height": 900})
        goto("#/")
        man = pg.evaluate("""async () => {
          const r = await fetch('manifest.json');
          if (!r.ok) return 'http-' + r.status;
          const j = await r.json();
          return (j.icons || []).length ? 'ok' : 'no-icons';
        }""")
        check("manifest.json 可加载且含图标", man, "ok")
        icon_ok = pg.evaluate("""async () => {
          const urls = ['assets/img/icon-192.png','assets/img/icon-512.png','assets/img/icon-180.png'];
          const rs = await Promise.all(urls.map(u => fetch(u).then(r => r.ok)));
          return rs.every(Boolean);
        }""")
        check("PWA 图标均可访问", icon_ok, True)

        # ---------- 真题阅读（#/reading，网页版做题）----------
        goto("#/reading")
        check("阅读页材料 tab = 3", pg.locator(".rd-tab").count(), 3)
        check("阅读页默认显示原文页图（6 页）", pg.locator(".rd-img").count(), 6)
        check("阅读数据含 2 套 Model Test",
              pg.evaluate("() => TW.READING.practice.tests.length"), 2)
        goto("#/reading?tab=practice&test=mt1&mode=card")
        check("阅读答题卡题量 = 30", pg.locator(".ans-q").count(), 30)
        # 页面图应能加载（图片保真阅读是这一页的核心）
        img_ok = pg.evaluate("""async () => {
          const r = await fetch('assets/reading/practice/p01.webp');
          return r.ok && (r.headers.get('content-type') || '').indexOf('image') >= 0;
        }""")
        check("阅读页图可正常加载", img_ok, True)

        # ---------- 控制台错误 ----------
        check("控制台错误数 = 0", len(errors), 0)

        pg.wait_for_timeout(200)
        log("")
        log("=== 失败项 ===")
        failed = [c for c in checks if not c]
        log("失败 %d / 共 %d 项断言" % (len(failed), len(checks)))
        if errors:
            log("=== 控制台错误 ===")
            for e in errors[:20]:
                log("  " + e)
        sys.stdout.flush()
        os._exit(0 if not failed and not errors else 3)


if __name__ == "__main__":
    main()
