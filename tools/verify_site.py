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
            ("11d-srs-empty", "#/srs"),
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

        # ---------- 首页搜词 ----------
        # 联想 = 周计划 + 已加载词典（searchAll，前缀优先）；精确兜底 = dict-ext 全量键值
        log("\n--- 首页搜词：联想 / 中文搜释义 / ext 兜底 / 回车直达 ---")
        goto("#/")
        check("首页有搜索框", pg.locator("#hs-input").count(), 1)

        pg.fill("#hs-input", "event")
        pg.wait_for_timeout(650)                      # 220ms 防抖 + 渲染
        res = pg.evaluate("() => Array.from(document.querySelectorAll('.hs-item')).map(b => b.dataset.w)")
        check("输入 event 出现联想结果", len(res) > 0, True, extra=str(res[:5]))
        check("联想含 eventually", "eventually" in res, True, extra=str(res[:5]))
        check("结果条带释义", pg.evaluate(
            "() => (document.querySelector('.hs-item .hs-brief')||{textContent:''}).textContent.length > 0"), True)

        pg.click(".hs-item")
        pg.wait_for_timeout(1600)                     # 详解按需加载 dict.js
        check("点击联想结果跳详解页", "#/word?w=" in pg.evaluate("() => location.hash"), True)
        check("详解页渲染出来", pg.locator("#dc-back").count() > 0, True)

        goto_fresh("#/")
        pg.fill("#hs-input", "使")
        pg.wait_for_timeout(650)
        res2 = pg.evaluate("() => Array.from(document.querySelectorAll('.hs-item')).map(b => b.dataset.w)")
        check("中文搜释义「使」出结果", len(res2) > 0, True, extra=str(res2[:5]))

        # ext 兜底：选一个不在周计划里的词（词库没加载任何 deck 时 searchAll 搜不到）
        ext_word = pg.evaluate("""() => {
          const k = Object.keys(TW.DICT_EXT || {})[0];          // dict-ext 第一个键（如 abash）
          return (k && !TW.data.byWord(k)) ? k : null;
        }""")
        if ext_word:
            pg.fill("#hs-input", ext_word)
            pg.wait_for_timeout(2000)                 # 首次要拉 dict-ext.js（约 1MB）
            res3 = pg.evaluate("() => Array.from(document.querySelectorAll('.hs-item')).map(b => b.dataset.w)")
            check("dict-ext 精确兜底命中「%s」" % ext_word, res3, [ext_word], extra=str(res3))
        else:
            check("dict-ext 兜底（跳过：首页词表已覆盖全部键）", True, True)

        # 词典词面索引兜底：词库全量加载后 deceptive 直接被 searchAll 命中
        # （首页搜索会后台拉齐 13 本词典；兜底链仅在载入窗口期/离线时使用）
        pg.fill("#hs-input", "deceptive")
        pg.wait_for_timeout(2500)                 # 首次要拉全部词典（~3.4MB）
        res4 = pg.evaluate("() => Array.from(document.querySelectorAll('.hs-item')).map(b => b.dataset.w)")
        check("未加载词典里的词也能搜到（deceptive）", "deceptive" in res4, True, extra=str(res4))
        check("词典词结果标注来源", "词典" in pg.evaluate(
            "() => (document.querySelector('.hs-item .hs-src')||{textContent:''}).textContent"), True)
        pg.click(".hs-item")
        pg.wait_for_timeout(2200)
        h4 = pg.evaluate("() => decodeURIComponent(location.hash)")
        check("点击进入词典词条详解", ("w=deceptive" in h4) or ("id=gre:deceptive" in h4) or ("id=toefl:deceptive" in h4), True,
              extra=h4)
        check("词典词条详解渲染出释义", pg.locator(".dc-means").count() > 0, True)

        goto_fresh("#/")                             # deceptive 段点进详解页了，先回首页

        # sunfleeting：中文搜释义不再截 8 条——词库全量加载后要尽可能全列 + 脚注计数
        pg.fill("#hs-input", "反对")
        pg.wait_for_timeout(900)
        n_fandui = pg.evaluate("() => document.querySelectorAll('.hs-item').length")
        check("中文搜「反对」结果超过旧上限 8 条", n_fandui > 8, True, extra="n=%d" % n_fandui)
        check("结果区有「共 N 条结果」脚注", pg.evaluate(
            "() => (document.querySelector('.hs-count')||{textContent:''}).textContent.indexOf('共 ') === 0"), True)
        check("结果区可滚动（不把首页无限顶长）", pg.evaluate(
            "() => { const el = document.querySelector('.hs-res'); return el && el.scrollHeight > el.clientHeight; }"), True)

        # 在线词典兜底正例：本地（周计划+12 词典+dict-ext）全没有的词 → 有道 suggest
        # JSONP 拿中文简释（依赖外网；有道接口很稳，硬断言）
        pg.fill("#hs-input", "flabbergasted")
        got_online = False
        for _ in range(16):
            pg.wait_for_timeout(500)
            if pg.evaluate("() => !!document.querySelector('.hs-src.online')"):
                got_online = True
                break
        check("在线词典兜底：本地没有的词（flabbergasted）给出在线结果", got_online, True)
        check("在线结果带释义（中文简释）", len(pg.evaluate(
            "() => (document.querySelector('.hs-on-def') || {textContent: ''}).textContent.trim()")) > 0, True)

        pg.fill("#hs-input", "zzqqxx")
        # 乱码会走完整兜底链：词面索引 → dict-ext → 在线词典（有网络延迟，失败/404 最终返回 null）
        # ⇒ 只要求最终给出明确提示，不限时点
        got_final = False
        for _ in range(20):
            t = pg.evaluate("() => document.body.innerText")
            if "词库里没有" in t or "在线" in t:
                got_final = True
                break
            pg.wait_for_timeout(500)
        check("乱码最终给出明确提示（词库里没有 / 在线结果）", got_final, True)

        pg.fill("#hs-input", "eventually")
        pg.wait_for_timeout(650)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(1400)
        check("回车直达第一条详解", "#/word?w=eventually" in pg.evaluate("() => location.hash"), True)

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
        # 反馈页不再自动跳下一词（autoNext 已移除）——显式按 Enter 继续，再读进度
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(700)
        pos_txt = pg.evaluate("() => TW.$('#p-pos').textContent")
        check("按 Enter 后进度推进到第 2 词", "第 2 " in pos_txt, True)

        # ---------- 练习：答错先给一次重做机会，再错才判错 ----------
        goto("#/practice?book=week1&mode=recall&size=10")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(500)
        t1 = pg.evaluate("() => document.body.innerText")
        check("第一次答错只提示重做、不揭答案", ("再试一次" in t1 and "答错" not in t1), True)
        check("重做时输入框仍在（未进入反馈态）", pg.locator("#p-input").count(), 1)
        # 会话续接后（practice.js resume），从 type 切到 recall 会带着上一段的统计：
        # 第 1 词答对过 ⇒ 正确率 100%；全新会话则还是「开始吧」。两种都算「未改判」，
        # 关键是第一次答错不能把正确率打成 0%。
        acc_txt = pg.evaluate("() => TW.$('#p-acc').textContent")
        check("第一次答错不改判（正确率仍是 100% 或未开始）",
              acc_txt in ("开始吧", "正确率 100%"), True)
        check("输入框已清空待重打", pg.evaluate("() => TW.$('#p-input').value"), "")
        pg.screenshot(path=str(SHOTS / "15-practice-retry.png"))

        # 重做仍错 → 判错 + 揭示答案，但必须**照着答案重打一遍**才能继续（sunfleeting 要求）
        pg.fill("#p-input", "yyyyyy")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(500)
        t2 = pg.evaluate("() => document.body.innerText")
        check("重做仍错才判错并要求重打（揭示答案卡 + 「再打一遍」）",
              ("再打一遍" in t2 and pg.locator("#p-reveal").count() == 1), True)
        check("重打阶段不给「继续」按钮（不能跳过重打）", pg.locator("[data-act='next']").count(), 0)
        pg.screenshot(path=str(SHOTS / "15-practice-wrong.png"))
        # 此后开始有到期复习词（答错自动入队）——给「每日复习提醒」门槛种上今日已提醒标记，
        # 免得它挡住后面所有学新词的既有用例（门槛本身有专属用例，见「每日复习提醒」段）
        pg.evaluate("() => { const d = new Date(); localStorage.setItem('tw.reviewRemind', d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()); }")

        # 「看答案」= 放弃重做：同样揭示答案并要求重打一遍
        goto_fresh("#/practice?book=week1&mode=recall&size=10")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(400)
        pg.locator("[data-act='giveup']").click()
        pg.wait_for_timeout(400)
        t_g = pg.evaluate("() => document.body.innerText")
        check("点「看答案」判错并揭示答案 + 要求重打",
              ("再打一遍" in t_g and pg.locator("#p-reveal").count() == 1), True)

        # 「不会」按钮 + 两个快捷键（sunfleeting：不会、看答案都要有键盘快捷键；
        # 不会之后也要打一遍单词 —— 与「看答案」同路径：判错 + 揭答案 + 重打）
        goto_fresh("#/practice?book=week1&mode=recall&size=10")
        check("打字模式答题阶段有「不会」按钮", pg.locator("[data-act='no']").count() >= 1, True)
        pg.keyboard.press("Alt+N")
        pg.wait_for_timeout(600)
        t_n = pg.evaluate("() => document.body.innerText")
        check("Alt+N 触发「不会」（判错 + 揭答案 + 要求重打）",
              ("再打一遍" in t_n and pg.locator("#p-reveal").count() == 1
               and pg.locator("[data-act='next']").count() == 0), True)
        check("「不会」后输入框仍在（必须照答案打一遍）", pg.locator("#p-input").count() == 1, True)
        goto_fresh("#/practice?book=week1&mode=recall&size=10")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(500)
        check("重做行「看答案」带 Alt+A 快捷键",
              "Alt+A" in pg.evaluate("() => (document.querySelector('#p-retry')||{innerText:''}).innerText"), True)
        pg.keyboard.press("Alt+A")
        pg.wait_for_timeout(500)
        check("Alt+A 触发「看答案」（揭示卡 + 要求重打）",
              pg.locator("#p-reveal").count() == 1, True)

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

        # ---------- 完成页快捷键（sunfleeting：完成页按钮也要有键盘快捷键）----------
        goto_fresh("#/practice?book=week1&mode=type&size=2")
        for _ in range(2):
            w_fin = pg.evaluate("() => (TW.$('#p-word')||{textContent:''}).textContent.trim()")
            if not w_fin:
                break
            pg.fill("#p-input", w_fin)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(450)
            pg.keyboard.press("Enter")   # 反馈页 Enter = 继续
            pg.wait_for_timeout(700)
        check("打完一组出完成页", pg.locator("[data-act='again']").count() == 1, True)
        check("完成页「再来一轮」带 R 快捷键",
              "R" in pg.evaluate("() => (document.querySelector(\"[data-act='again']\")||{innerText:''}).innerText"), True)
        check("完成页「复习错词」带 W 快捷键",
              "W" in pg.evaluate("() => (document.querySelector(\"[data-act='wrong']\")||{innerText:''}).innerText"), True)
        pg.keyboard.press("r")
        pg.wait_for_timeout(800)
        check("完成页按 R 触发「再来一轮」（回到答题）",
              pg.locator("#p-word").count() == 1, True)
        # 再打完这组，回完成页按 W → 复习错词
        for _ in range(2):
            w_fin2 = pg.evaluate("() => (TW.$('#p-word')||{textContent:''}).textContent.trim()")
            if not w_fin2:
                break
            pg.fill("#p-input", w_fin2)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(450)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(700)
        check("回到完成页", pg.locator("[data-act='again']").count() == 1, True)
        pg.keyboard.press("w")
        pg.wait_for_timeout(800)
        check("完成页按 W 触发「复习错词」", "status=wrong" in pg.evaluate("() => location.hash"), True)
        pg.screenshot(path=str(SHOTS / "17-finish-keys.png"))

        # ---------- 练习：翻卡模式应有词典详解入口（工具条，翻不翻面都常驻）----------
        goto_fresh("#/practice?book=week1&mode=flash&size=10")
        pg.wait_for_timeout(600)
        # 先确认真的渲染成了翻卡页：否则下面的断言在「空白页」上也会假通过
        # （旧实例的 autoNext 定时器曾把新页面覆盖掉，就是这一条抓出来的）
        check("翻卡页渲染出卡片（未被上一会话覆盖）", pg.locator("#p-card").count(), 1)
        # 详解入口从「翻面后的动作区」移到了常驻工具条（sunfleeting：发音/收藏/详解都要能按键盘，
        # 于是做成四个模式通用的工具条），所以未翻面时也应该有
        check("翻卡未翻面时就有「详解」入口",
              pg.locator(".practice-tools a[href^='#/word']").count() > 0, True)
        pg.click("[data-act='reveal']")
        pg.wait_for_timeout(500)
        check("翻面后「详解」入口仍在",
              pg.locator(".practice-tools a[href^='#/word']").count() > 0, True)
        pg.screenshot(path=str(SHOTS / "26-practice-flash-detail.png"))
        pg.locator(".practice-tools a[href^='#/word']").first.click()
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

        # ---------- 搜索（#/books 现在是「词典选择」页，搜索在具体词表里） ----------
        goto("#/books?book=all")
        pg.fill("#bk-search", "abbreviation")
        pg.wait_for_timeout(700)
        rows = pg.evaluate("() => document.querySelectorAll('#bk-list .wl-row').length")
        check("搜索命中 1 条", rows, 1)

        # ========== 常用词典（搬运自 qwerty-learner）==========
        goto("#/books")
        check("词典目录 = 14 本", pg.evaluate("() => TW.DECKS_META.length"), 14)
        check("词条总量 = 2714 + 44170",
              pg.evaluate("() => TW.data.totalWords()"), 2714 + 44170)
        check("词典 id 唯一", pg.evaluate(
            "() => { var s = {}; return TW.DECKS_META.every(function(d){ if (s[d.id]) return false; s[d.id]=1; return d.count > 0; }); }"), True)
        check("词典选择页卡片 >= 14", pg.locator(".deck-card").count() >= 14, True)
        check("词典选择页有分组标题", pg.locator(".deck-group-title").count() >= 3, True)
        pg.screenshot(path=str(SHOTS / "27-deck-chooser.png"))

        # 词典按需加载：打开 CET6 词表时才注入 data/dicts/cet6.js
        goto("#/books?book=cet6", 1600)
        check("词典清单已就绪",
              "cet6" in pg.evaluate("() => TW.data.decksLoaded()"), True)
        check("CET6 词表有内容",
              pg.evaluate("() => document.querySelectorAll('#bk-list .wl-row').length") > 0, True)
        first_id = pg.evaluate("() => document.querySelector('#bk-list .wl-row').dataset.id")
        check("词典词条 id 形如 cet6:xxx", str(first_id).startswith("cet6:"), True)
        check("CET6 词条数 = 2345",
              pg.evaluate("() => TW.data.byBook('cet6').length"), 2345)
        pg.screenshot(path=str(SHOTS / "28-deck-cet6.png"))

        # 词典词进入详情页（无有道词典卡，但要能显示音标与释义）
        pg.locator("#bk-list .wl-row .wl-link").first.click()
        pg.wait_for_timeout(1000)
        check("词典词可进入详情页", "#/word" in pg.evaluate("() => location.hash"), True)
        dword = pg.evaluate("() => (TW.$('.dc-word') || {}).textContent || ''")
        check("详情页显示词典词", bool(dword.strip()), True)
        check("详情页标注「仅提供音标与释义」",
              "仅提供音标与释义" in pg.evaluate("() => document.body.innerText"), True)
        pg.screenshot(path=str(SHOTS / "29-deck-word.png"))

        # 词典词表一键练习（要等词典加载完再渲染）
        goto("#/books?book=cet6", 1600)
        pg.click("#bk-practice")
        pg.wait_for_timeout(1600)
        check("词典词表可进入练习",
              bool(pg.evaluate("() => (TW.$('#p-word') || {}).textContent || ''")), True)
        check("练习页标注词典名",
              "大学英语六级" in pg.evaluate("() => (TW.$('.pp-src') || {}).textContent || ''"), True)

        # ========== 生词本 + 艾宾浩斯复习队列 ==========
        pg.evaluate("() => localStorage.removeItem('typingcet.state.v1')")
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_timeout(900)
        check("复习队列初始为空", pg.evaluate("() => TW.store.srs.stats().total"), 0)

        # 练习里连错两次 → 判错 → 自动进入复习队列
        goto("#/practice?book=week1&mode=type&size=3")
        auto_word = pg.evaluate("() => TW.$('#p-word').textContent.trim()")
        pg.fill("#p-input", "zzzzzz")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(350)
        pg.fill("#p-input", "yyyyyy")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(600)
        st = pg.evaluate("(w) => TW.store.srs.get(w)", auto_word)
        check("答错的词自动进入复习队列", bool(st), True)
        check("复习记录带来源与简释", bool(st and st.get("s") and st.get("m")), True)
        check("新入队的词今天到期",
              bool(st and st.get("d") == pg.evaluate("() => TW.store.today()")), True)
        check("导航出现待复习角标", pg.locator(".nav-badge.srs").count() >= 1, True)

        # 生词本（跨所有词库）
        goto("#/review?tab=wrong")
        check("错词本包含该词", pg.evaluate(
            "(w) => TW.data.progressItems('wrong').some(function(x){ return x.word === w; })", auto_word), True)
        check("错词本有序",
              pg.evaluate("() => document.querySelectorAll('#rv-list .wl-row').length") >= 1, True)
        check("错词行显示复习档位", pg.locator("#rv-list .tag.srs").count() >= 1, True)
        pg.screenshot(path=str(SHOTS / "16-review-wrong.png"))
        pg.click("#rv-practice-top")
        pg.wait_for_timeout(900)
        check("生词本「练习这组」进入生词本会话",
              "src=collection" in pg.evaluate("() => location.hash"), True)
        check("生词本练习页标注分组名",
              "待攻克错词" in pg.evaluate("() => (TW.$('.pp-src') || {}).textContent || ''"), True)

        # ---------- 每日复习提醒（sunfleeting：每天学新词前必须提醒先复习）----------
        # 此刻复习队列已有到期词（前面答错自动入队），且今天还没提醒过
        pg.evaluate("() => localStorage.removeItem('tw.reviewRemind')")
        goto_fresh("#/practice?book=week1&mode=recall&size=10")
        t_gate = pg.evaluate("() => document.body.innerText")
        check("有到期复习词时进新词练习先弹「先复习」提醒",
              ("先复习，再学新词" in t_gate and pg.locator("#p-go-review").count() == 1), True)
        check("提醒页给「今天不再提醒」逃生口", pg.locator("#p-skip-review").count() == 1, True)
        pg.screenshot(path=str(SHOTS / "18-review-gate.png"))
        pg.click("#p-go-review")
        pg.wait_for_timeout(900)
        check("「先去复习」跳到复习队列", "src=srs" in pg.evaluate("() => location.hash"), True)
        # 当天第二次进入不再打扰
        goto_fresh("#/practice?book=week1&mode=recall&size=10")
        check("当天已提醒过就不再打扰",
              "先复习，再学新词" not in pg.evaluate("() => document.body.innerText"), True)

        # 复习页
        goto("#/srs", 1200)
        check("复习页今日待复习 >= 1",
              pg.evaluate("() => TW.store.srs.dueCount()") >= 1, True)
        check("复习页有 8 天排期条", pg.locator(".sched-col").count(), 8)
        check("复习页有开始按钮", pg.locator("#sr-start").count(), 1)
        pg.screenshot(path=str(SHOTS / "30-srs.png"))

        # 开始复习 → 答对一次 → 升档、到期日推到明天
        pg.click("#sr-start")
        pg.wait_for_timeout(1000)
        check("复习会话已开始", "src=srs" in pg.evaluate("() => location.hash"), True)
        check("复习页练习标注「今日复习」",
              "今日复习" in pg.evaluate("() => (TW.$('.pp-src') || {}).textContent || ''"), True)
        rword = pg.evaluate("() => TW.$('#p-word').textContent.trim()")
        pg.fill("#p-input", rword)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(700)
        rec = pg.evaluate("(w) => TW.store.srs.get(w)", rword)
        check("答对后复习档位升到第 1 档", bool(rec and rec.get("b") == 1), True)
        check("答对后到期日 = 明天", bool(rec and rec.get("d") == pg.evaluate(
            "() => TW.store.addDays(TW.store.today(), 1)")), True)
        check("今日待复习清零", pg.evaluate("() => TW.store.srs.dueCount()"), 0)
        pg.screenshot(path=str(SHOTS / "31-srs-done.png"))

        # srs 会话续接不得残留已复习完的词表（sunfleeting：复习页写着 6 个、点进去是上次的 20 个）
        pg.evaluate("""() => {
          TW.WORDS.filter(function (x) { return !TW.store.srs.get(x.word); }).slice(0, 3)
            .forEach(function (x) { TW.store.srs.enroll(x.word, x.book || '', 't'); });
        }""")
        goto_fresh("#/srs", 1200)
        pg.click("#sr-start")
        pg.wait_for_timeout(1000)
        for _ in range(3):   # 练完这一组（3 题，全对 → 全部升档移出到期）
            w2 = pg.evaluate("() => (TW.$('#p-word')||{textContent:''}).textContent.trim()")
            if not w2:
                break
            pg.fill("#p-input", w2)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(500)
            pg.keyboard.press("Enter")   # 反馈页继续
            pg.wait_for_timeout(800)
        if pg.locator("[data-act='again']").count() == 1:
            pg.locator("[data-act='again']").click()   # 「再来一轮」→ resume 残留（整组已复习完）
            pg.wait_for_timeout(800)
        goto_fresh("#/", 800)                           # 中途离开
        # 一个新词到期
        pg.evaluate("""() => {
          const x = TW.WORDS.find(function (w) { return !TW.store.srs.get(w.word); });
          if (x) TW.store.srs.enroll(x.word, x.book || '', 't');
        }""")
        goto("#/srs", 1200)
        pg.click("#sr-start")
        pg.wait_for_timeout(1200)
        cur_w = pg.evaluate("() => (TW.$('#p-word')||{textContent:''}).textContent.trim()")
        new_word = pg.evaluate("() => TW.store.srs.dueList().map(function (r) { return r.w; })[0]")
        check("srs 续接不残留已复习完的词表（进入即当前到期词）",
              bool(cur_w) and cur_w == new_word, True)

        # 设置页有复习相关开关
        goto("#/settings")
        check("设置里有「自动加入复习队列」开关",
              pg.locator("[data-switch='srsAuto']").count(), 1)
        check("设置里有「清空复习队列」按钮", pg.locator("#data-srs-clear").count(), 1)

        # ---------- 音频页 ----------
        # 首屏不加载词典卡 —— 🔴 必须放在任何详情页访问之前（详情页会按需注入 dict.js）
        goto("#/")
        boot_dict = pg.evaluate("() => !!(window.TW.data && TW.data.dictReady())")
        check("首屏不加载词典卡（按需加载）", boot_dict, False)
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

        # 音频行详解入口（sunfleeting：每个单词要能进详解）
        check("音频行有详解入口（灯泡）", pg.locator(".ly-detail").count(), 250)
        pg.locator(".ly-detail").first.click()
        pg.wait_for_timeout(1300)
        check("点详解入口进详情页", "#/word?id=" in pg.evaluate("() => location.hash"), True)
        check("详情页渲染出词面", pg.locator(".dc-word").count() > 0, True)

        # 详情页发音委托不叠加：旧 bug 是每次进详情页都往复用的 #view 容器上**追加**一层
        # click 委托，点一次美音读 N 遍（N = 本次加载内进过详情页的次数）
        pg.locator(".dc-nav-sp a").first.click()      # 经「下一个词」箭头再进一次详情页
        pg.wait_for_timeout(1300)
        check("第二个词的详情页有美音按钮", pg.locator(".dc-phon").count() >= 1, True)
        pg.evaluate("() => { window.__spk = []; TW.speech.speak = (t) => { window.__spk.push(t); }; }")
        pg.locator(".dc-phon").first.click()
        pg.wait_for_timeout(400)
        check("点一次美音只发一次音（监听不叠加）",
              len(pg.evaluate("() => window.__spk")), 1,
              extra=str(pg.evaluate("() => window.__spk")))

        # ---------- 词典卡：首屏按需加载 ----------
        dr_id = pg.evaluate("() => (TW.WORDS.find(w => w.word === 'drastic') || {}).id")
        check("drastic 在词库中", bool(dr_id), True)

        # 静态服务完整性：大文件必须原样下发。
        # 背景：serve.py 曾在 keep-alive 下把上一次 Range 请求的长度残留给下一个普通请求，
        # 导致 dict.js 响应 200 但内容被截断（详情页因此空白）。这里做字节级兜底核验。
        for _f in ("data/dict.js", "data/dict-ext.js", "data/deck-index.js", "data/words.js", "data/dicts/cet6.js"):
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
        check("词典卡已按需加载（drastic 字母块）", pg.evaluate("() => TW.data.dictLetterReady('drastic')"), True)
        check("扩展词条已按需加载（同字母块）", pg.evaluate("() => TW.data.extLetterReady('drastic')"), True)
        dict_n = pg.evaluate("() => Object.keys(TW.DICT || {}).length")
        check("词典卡数量 >= 100（按字母分块，单块就够用）", dict_n >= 100, True)
        check("整本词典卡未被全量加载（分块生效）", pg.evaluate("() => TW.data.dictReady()"), False)
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

        # 扩展词条页也要有学习笔记（sunfleeting：aback 类 ext 词之前没地方记笔记）
        pg.goto(BASE + "#/word?w=aback", wait_until="domcontentloaded")
        try:
            pg.wait_for_selector("#dc-note", timeout=15000)
        except Exception:
            pass
        pg.wait_for_timeout(300)
        check("扩展词条页有「学习笔记」卡", pg.locator("#dc-note").count(), 1)
        pg.fill("#dc-note", "测试笔记xyz")
        pg.wait_for_timeout(900)   # 600ms 防抖 + 落盘
        check("扩展词条笔记已保存（x:词面 进度记录）",
              pg.evaluate("() => (TW.store.get('x:aback') || {}).note"), "测试笔记xyz")
        pg.screenshot(path=str(SHOTS / "23-ext-note.png"))

        # 扩展词条也要有收藏/掌握/拼写练习（sunfleeting：aback 这种也要完整学习闭环）
        check("扩展词条有收藏/掌握按钮",
              (pg.locator(".dc-head [data-act='fav']").count() == 1 and
               pg.locator(".dc-head [data-act='master']").count() == 1), True)
        check("扩展词条有拼写练习卡", pg.locator("#dc-spell-input").count(), 1)
        pg.click("[data-act='fav']")   # 点收藏（aback → x:aback）
        pg.wait_for_timeout(400)
        check("扩展词条收藏落库（x: 记录）",
              pg.evaluate("() => (TW.store.get('x:aback') || {}).fav"), True)
        check("收藏的扩展词条出现在生词本「我的收藏」",
              pg.evaluate("() => TW.data.progressItems('fav').some(function (x) { return x.id === 'x:aback'; })"), True)
        # x: 前缀 id 能跳回对应详解（生词本行点击的路径）
        pg.goto(BASE + "#/word?id=" + pg.evaluate("() => encodeURIComponent('x:aback')"), wait_until="domcontentloaded")
        pg.wait_for_timeout(1200)
        check("x: 前缀 id 可打开扩展词条详解",
              (pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent.trim()"), True)[1] and
              "aback" in pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent"), True)

        # 「我的笔记」分类：写过笔记的词集中可查（sunfleeting）
        goto("#/review?tab=notes")
        t_notes = pg.evaluate("() => document.body.innerText")
        check("生词本有「我的笔记」tab", "我的笔记" in t_notes, True)
        check("笔记列表含写过笔记的 aback（含笔记摘要）",
              ("aback" in t_notes and "测试笔记xyz" in t_notes), True)
        pg.screenshot(path=str(SHOTS / "24-review-notes.png"))
        # 笔记行点击跳对应详解（x: 词走扩展词条页）
        pg.locator("#rv-list .wl-row .wl-link").first.click()
        pg.wait_for_timeout(1200)
        check("笔记行点击跳对应详解（aback）",
              ("aback" in pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent")), True)

        # 搜索记录：最近 50 条，聚焦空输入框可查看（sunfleeting）
        goto("#/")
        pg.fill("#hs-input", "account")
        pg.wait_for_timeout(600)
        pg.locator(".hs-item").first.click()
        pg.wait_for_timeout(800)
        check("搜索动作写入最近搜索记录",
              pg.evaluate("() => (JSON.parse(localStorage.getItem('tw.searchHistory') || '[]').some(function (x) { return x.w === 'account'; }))"), True)
        pg.goto(BASE + "#/", wait_until="load")
        pg.wait_for_timeout(800)
        pg.click("#hs-input")
        pg.wait_for_timeout(500)
        hist_txt = pg.evaluate("() => (TW.$('#hs-res')||{innerText:''}).innerText")
        check("聚焦空搜索框显示「最近搜索」", ("最近搜索" in hist_txt and "account" in hist_txt), True)
        check("搜索记录含清空按钮", pg.locator("#hs-hist-clear").count(), 1)
        pg.click("#hs-hist-clear")
        pg.wait_for_timeout(300)
        check("清空后记录消失",
              pg.evaluate("() => JSON.parse(localStorage.getItem('tw.searchHistory') || '[]').length"), 0)

        # 首页统计卡可点击（sunfleeting：点数字要看得到明细）
        goto("#/")
        cards = pg.evaluate("() => Array.from(document.querySelectorAll('.stat-card[data-go]')).map(function (x) { return x.dataset.go; })")
        check("5 张统计卡都可点击且目标正确", cards,
              ["/books", "/review?tab=learned", "/review?tab=master", "/review?tab=wrong", "/srs"])
        pg.locator(".stat-card[data-go='/review?tab=wrong']").click()
        pg.wait_for_timeout(900)
        check("点「待攻克错词」卡跳生词本对应分组",
              ("#/review?tab=wrong" in pg.evaluate("() => location.hash") and
               "共 " in pg.evaluate("() => document.body.innerText")), True)
        goto("#/review?tab=learned")
        t_learned = pg.evaluate("() => document.body.innerText")
        check("生词本有「已练过」tab 且有词条", ("已练过" in t_learned and "共 " in t_learned), True)

        # ---------- 详解页拼写练习（sunfleeting：详解页也要能练打单词）----------
        # 回到已知本地词 drastic：近义词跳转目标可能是 ext 词条（没有拼写练习卡）
        pg.goto(BASE + "#/word?id=" + str(dr_id), wait_until="domcontentloaded")
        try:
            pg.wait_for_selector("#dc-spell-input", timeout=15000)
        except Exception:
            pass
        pg.wait_for_timeout(400)
        check("详情页有「拼写练习」板块",
              "拼写练习" in pg.evaluate("() => Array.from(document.querySelectorAll('.dc-sec-title span')).map(x=>x.textContent).join('|')"), True)
        sp_word = pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent.trim()")
        pg.fill("#dc-spell-input", "zzzzzz")
        pg.click("#dc-spell-check")
        pg.wait_for_timeout(300)
        check("拼错提示再试一次", "再试一次" in pg.evaluate("() => (TW.$('#dc-spell-fb')||{innerText:''}).innerText"), True)
        pg.fill("#dc-spell-input", "zzzzzz")
        pg.click("#dc-spell-check")
        pg.wait_for_timeout(300)
        check("错两次自动揭答案并要求重打",
              ("答案" in pg.evaluate("() => (TW.$('#dc-spell-fb')||{innerText:''}).innerText")
               and sp_word in pg.evaluate("() => (TW.$('#dc-spell-fb')||{innerText:''}).innerText")), True)
        check("揭答案后输入框被清空（必须重打）",
              pg.evaluate("() => (TW.$('#dc-spell-input')||{value:''}).value") == "", True)
        pg.fill("#dc-spell-input", sp_word)
        pg.click("#dc-spell-check")
        pg.wait_for_timeout(300)
        check("照答案重打成功", "重打正确" in pg.evaluate("() => (TW.$('#dc-spell-fb')||{innerText:''}).innerText"), True)
        pg.screenshot(path=str(SHOTS / "21-word-spelling.png"))

        # 拼写练习快捷键（sunfleeting：检查/看答案也要有快捷键）
        check("「检查」带 Enter 快捷键提示",
              "Enter" in pg.evaluate("() => (TW.$('#dc-spell-check')||{innerText:''}).innerText"), True)
        check("「看答案」带 Alt+V 快捷键提示",
              "Alt+V" in pg.evaluate("() => (TW.$('#dc-spell-reveal')||{innerText:''}).innerText"), True)
        pg.fill("#dc-spell-input", "zzzzzz")
        pg.keyboard.press("Alt+V")   # 输入框 focus 状态下也要能触发
        pg.wait_for_timeout(300)
        check("Alt+V 触发「看答案」（揭答案 + 要求重打）",
              ("答案" in pg.evaluate("() => (TW.$('#dc-spell-fb')||{innerText:''}).innerText")
               and sp_word in pg.evaluate("() => (TW.$('#dc-spell-fb')||{innerText:''}).innerText")), True)

        # ---------- 详解页键盘快捷键（Esc 返回 / ←→ 换词 / F 收藏）----------
        pg.evaluate("() => document.activeElement && document.activeElement.blur()")   # 别留在输入框里
        d0 = pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent.trim()")
        pg.keyboard.press("ArrowRight")
        pg.wait_for_timeout(700)
        d1 = pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent.trim()")
        check("→ 跳到下一个词", bool(d1) and d1 != d0, True)
        pg.keyboard.press("ArrowLeft")
        pg.wait_for_timeout(700)
        check("← 跳回上一个词",
              pg.evaluate("() => (TW.$('.dc-word')||{textContent:''}).textContent.trim()"), d0)
        pg.keyboard.press("f")
        pg.wait_for_timeout(300)
        check("F 切换收藏", pg.evaluate("(id) => (TW.store.get(id) || {}).fav", dr_id), True)
        pg.keyboard.press("f")
        pg.wait_for_timeout(300)
        check("再按 F 取消收藏", pg.evaluate("(id) => (TW.store.get(id) || {}).fav", dr_id), False)
        h0 = pg.evaluate("() => location.hash")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(700)
        check("Esc 返回上一页", pg.evaluate("() => location.hash") != h0, True)
        pg.screenshot(path=str(SHOTS / "22-word-keys.png"))

        # ---------- 全站 Esc 返回（sunfleeting：每个界面都要能按 Esc 返回）----------
        goto("#/")                     # 造历史：首页 → 词库
        goto("#/books")
        pg.keyboard.press("Escape")    # books 无自己的 Esc 语义 → 全局返回
        pg.wait_for_timeout(700)
        check("词库页按 Esc 返回上一页", pg.evaluate("() => location.hash"), "#/")
        goto("#/stats")
        h_s = pg.evaluate("() => location.hash")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(700)
        # 不锁死回退目标（同文档 hash 导航的 history 条目顺序不稳定），只验证「Esc 会返回」
        check("统计页按 Esc 返回上一页", pg.evaluate("() => location.hash") != h_s, True)

        # 近 14 天练习量柱状图：daily 数据非零时柱子必须真的画出来（回归：
        # .bar-fill 的百分比高度曾因 .bar-col 高度不定而塌成 3px 矮桩，
        # 数据全对但图面像「练习量为零」）
        pg.evaluate("""() => {
            const t = TW.store.today();
            const d = TW.store.state.daily;
            d[t] = { done: 80, right: 60 };
            const y = new Date(); y.setDate(y.getDate() - 1);
            const m = y.getMonth() + 1, dd = y.getDate();
            d[y.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd] = { done: 40, right: 30 };
            TW.store.save();
        }""")
        goto("#/stats")
        pg.wait_for_timeout(700)
        bar_info = pg.evaluate("""() => {
            const fills = [...document.querySelectorAll('.bar-fill')];
            const hs = fills.map(el => el.getBoundingClientRect().height);
            return { n: fills.length, max: Math.max.apply(null, hs),
                     today: fills[fills.length - 1] ? fills[fills.length - 1].getBoundingClientRect().height : 0 };
        }""")
        check("柱状图柱子真的画出来了（不是 3px 矮桩）", bar_info["max"] > 30, True, extra=str(bar_info))
        check("今天（数据最大那天）柱子最高", bar_info["today"] == bar_info["max"], True)
        pg.evaluate("""() => {
            const d = TW.store.state.daily;
            delete d[TW.store.today()];
            const y = new Date(); y.setDate(y.getDate() - 1);
            const m = y.getMonth() + 1, dd = y.getDate();
            delete d[y.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd];
            TW.store.save();
        }""")

        # 听音写词：题面默认不显示音标（音标=泄题一半），设置打开后才显示
        log("\n--- 听音写词音标选项 ---")
        keep_ph = pg.evaluate("() => TW.store.settings.listenPhonetic")
        pg.evaluate("() => TW.store.setSetting('listenPhonetic', false)")
        goto_fresh("#/practice?book=week1&mode=listen")
        pg.wait_for_timeout(600)
        check("听音写词默认不显示音标", pg.evaluate(
            "() => (document.querySelector('#p-word') || {}).textContent || ''"), "听发音写单词")
        pg.evaluate("() => TW.store.setSetting('listenPhonetic', true)")
        goto_fresh("#/practice?book=week1&mode=listen")   # 练习页不监听 settings 事件，重进生效
        pg.wait_for_timeout(600)
        ph = pg.evaluate("() => (document.querySelector('#p-word') || {}).textContent || ''")
        check("打开设置后题面显示音标", ph.startswith("/") and ph.endswith("/"), True, extra=ph)
        pg.evaluate("(v) => TW.store.setSetting('listenPhonetic', v)", keep_ph)
        # 豁免页不劫持：练习页 Esc = 跳过当前词（不是返回）
        goto_fresh("#/practice?book=week1&mode=type&size=10")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(700)
        check("练习页 Esc 仍是「跳过」而非返回", "practice" in pg.evaluate("() => location.hash"), True)

        # 有道没有反义词的词也不应报错；找一个有反义词的词看板块
        # （词典卡已按字母分块，这里显式载 a 块——abundant 的反义词是 scarce）
        goto("#/")
        pg.evaluate("() => new Promise(function (res) { TW.data.loadDict(res, 'abundant'); })")
        pg.wait_for_timeout(600)
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
        # 移动端：词典选择页 / 复习页
        goto("#/books")
        pg.wait_for_timeout(600)
        pg.screenshot(path=str(SHOTS / "32-mobile-decks.png"))
        check("移动端词典选择页无横向溢出",
              pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth") <= 1, True)
        goto("#/srs")
        pg.wait_for_timeout(700)
        pg.screenshot(path=str(SHOTS / "33-mobile-srs.png"))
        check("移动端复习页无横向溢出",
              pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth") <= 1, True)
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
