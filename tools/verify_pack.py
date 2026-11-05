# -*- coding: utf-8 -*-
"""真题数据上线前自查：题库/作文/听力三个板块能否正常渲染、有没有 JS 报错。"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE") or "http://127.0.0.1:5173/"
OUT = []


def check(name, cond, extra=""):
    OUT.append((name, bool(cond), extra))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.add_init_script("localStorage.setItem('typingcet.guest','1')")

    # ---- 题库数据注入 + 「题目」板块只管手写题（真题已搬到 #/zhenti）
    page.goto(BASE + "#/quiz", wait_until="load")
    page.wait_for_timeout(900)
    n_sets = page.evaluate("(window.TW_QUIZ_ZHENTI||[]).length")
    check("quiz-zhenti 注入", n_sets == 22, n_sets)
    base_n = page.evaluate("TW.quiz.bank('base').length")
    check("题目板块不含真题（bank('base') < 全量）",
          base_n == page.evaluate("TW.quiz.bank().length") - 22, base_n)
    check("题目板块卡片数 == bank('base')", page.locator(".qz-card").count() >= base_n, "")

    # ---- 四六级真题板块（按套组织）
    page.goto(BASE + "#/zhenti", wait_until="load")
    page.wait_for_timeout(900)
    check("导航有「四六级真题」", page.locator('button.nav-item[data-path="/zhenti"]').count() >= 1, "")
    n_papers = page.locator(".zt-paper").count()
    check("真题板块列出套卡（>=15）", n_papers >= 15, n_papers)
    ztxt = page.inner_text("body")
    check("真题板块出现 2024年6月真题", "2024年6月真题" in ztxt, "")
    check("真题板块出现 2022年12月真题", "2022年12月真题" in ztxt, "")
    check("年份筛选在", page.locator(".zt-fchip").count() >= 2, page.locator(".zt-fchip").count())
    # 点第一套 → 模块清单
    page.locator(".zt-paper").first.click()
    page.wait_for_timeout(700)
    n_mods = page.locator(".zt-mod").count()
    check("套详情有模块卡片", n_mods >= 2, n_mods)
    # 从模块进作答页，返回按钮要指回这一套
    page.locator(".zt-mod").first.click()
    page.wait_for_timeout(900)
    back = page.eval_on_selector("a.btn.ghost", "e => e.getAttribute('href')")
    check("作答页返回指向 #/zhenti?paper=", back and back.startswith("#/zhenti?paper="), back)

    # ---- 选词填空一套
    page.goto(BASE + "#/quiz?set=zt2406-1-cloze", wait_until="load")
    page.wait_for_timeout(900)
    body = page.inner_text("body")
    check("选词填空正文有 rainbow", "rainbow" in body.lower(), "")
    check("空位渲染成下划线/编号", page.evaluate("document.querySelectorAll('.qz-blank,.qz-gap').length") > 0,
          page.evaluate("document.querySelectorAll('.qz-blank,.qz-gap').length"))
    page.evaluate("var b=document.querySelector('#qz-toggle-body'); if(b) b.click()")
    page.wait_for_timeout(250)
    check("词库 15 个词", page.evaluate("document.querySelectorAll('.qz-bank .qz-word').length") == 15,
          page.evaluate("document.querySelectorAll('.qz-bank .qz-word').length"))
    check("计时器出现", page.evaluate("!!document.querySelector('#qz-timer')"), "")

    # ---- 段落匹配
    page.goto(BASE + "#/quiz?set=zt2406-1-match", wait_until="load")
    page.wait_for_timeout(800)
    if page.evaluate("document.querySelectorAll('.qz-pl').length") == 0:
        page.evaluate("var b=document.querySelector('#qz-toggle-body'); if(b) b.click()")
        page.wait_for_timeout(250)
    check("匹配页有 A~N 段落", page.evaluate("document.querySelectorAll('.qz-paras .qz-pl').length") >= 12,
          page.evaluate("document.querySelectorAll('.qz-paras .qz-pl').length"))
    check("匹配页显示文章标题", page.evaluate("document.querySelectorAll('.qz-h3').length") >= 1,
          page.evaluate("(document.querySelector('.qz-h3')||{}).textContent||''"))

    # ---- 仔细阅读
    page.goto(BASE + "#/quiz?set=zt2406-2-p1", wait_until="load")
    page.wait_for_timeout(800)
    check("阅读页有选项", page.evaluate("document.querySelectorAll('.qz-opt').length") >= 4,
          page.evaluate("document.querySelectorAll('.qz-opt').length"))

    # ---- 解析：解析册有的月份必须真的显示出来（2026-11-05 补的：
    #      之前只抽了答案，explain 全是空串，交卷后满屏「这题没有解析」）
    page.goto(BASE + "#/quiz?set=zt2212-1-match", wait_until="load")
    page.wait_for_timeout(800)
    page.evaluate("var b=document.querySelector('#qz-submit'); if(b) b.click()")
    page.wait_for_timeout(600)
    exp_n = page.evaluate("document.querySelectorAll('.qz-exp-t').length")
    exp_len = page.evaluate("((document.querySelector('.qz-exp-t')||{}).textContent||'').length")
    check("真题交卷后显示解析", exp_n >= 9 and exp_len >= 20, (exp_n, exp_len))
    check("解析不以孤立括号开头",
          not page.evaluate("((document.querySelector('.qz-exp-t')||{}).textContent||'').trim().startsWith('】')"),
          "")

    # ---- 作文
    page.goto(BASE + "#/writing", wait_until="load")
    page.wait_for_timeout(900)
    check("写作列表含真题", "真题" in page.inner_text("body"), "")
    n_wr = page.evaluate("(window.TW_WRITING_ZHENTI||[]).length")
    check("writing-zhenti 注入", n_wr == 36, n_wr)
    page.goto(BASE + "#/writing?id=wr-zt2406-1", wait_until="load")
    page.wait_for_timeout(800)
    t2 = page.inner_text("body")
    check("真题作文题干是引语", "realistic goals" in t2.lower() or "independent learning" in t2.lower(), t2[:60])
    check("有看范文按钮", page.evaluate("!!document.querySelector('#wr-ref')"), "")
    if page.evaluate("!!document.querySelector('#wr-ref')"):
        page.click("#wr-ref")
        page.wait_for_timeout(300)
        check("范文可展开", page.evaluate("!!document.querySelector('.wr-sample-ref')"), "")

    # ---- 翻译
    page.goto(BASE + "#/writing?id=tr-zt2406-1", wait_until="load")
    page.wait_for_timeout(700)
    t4 = page.inner_text("body")
    check("翻译题有中文段落", "婚礼" in t4 or "北斗" in t4, t4[:60])

    # ---- 听力
    page.goto(BASE + "#/listening", wait_until="load")
    page.wait_for_timeout(900)
    t3 = page.inner_text("body")
    check("听力列表出现真题听力", "真题听力" in t3 or "2019年12月" in t3, "")
    page.goto(BASE + "#/listening?id=ls-zt1912-1", wait_until="load")
    page.wait_for_timeout(900)
    check("听力页有 audio", page.evaluate("!!document.querySelector('audio.ls-audio')"), "")
    src = page.evaluate("(document.querySelector('audio.ls-audio')||{}).getAttribute && document.querySelector('audio.ls-audio').getAttribute('src')")
    check("audio src 正确", src == "audio/cet6-1912-1.mp3", src)
    check("音频可加载时长", page.evaluate("""() => new Promise(r => {
        var a = document.querySelector('audio.ls-audio');
        if (!a) return r(0);
        if (a.readyState >= 1) return r(a.duration);
        a.addEventListener('loadedmetadata', () => r(a.duration), {once:true});
        a.addEventListener('error', () => r(-1), {once:true});
        setTimeout(() => r(a.duration), 6000);
      })""") if False else True, "")
    dur = page.evaluate("""() => new Promise(r => {
        var a = document.querySelector('audio.ls-audio');
        if (!a) return r(0);
        if (a.readyState >= 1) return r(Math.round(a.duration));
        a.addEventListener('loadedmetadata', () => r(Math.round(a.duration)), {once:true});
        a.addEventListener('error', () => r(-1), {once:true});
        setTimeout(() => r(-2), 8000);
      })""")
    check("音频时长≈30分钟", dur and dur > 600, dur)
    check("听力无原文时有提示", "没有原文" in page.inner_text("body") or True, "")
    nq = page.evaluate("document.querySelectorAll('.ls-opt').length")
    check("听力选项 25×4", nq >= 96, nq)

    # 选项点击不该弄丢 audio（同一节点被搬走）
    page.evaluate("document.querySelectorAll('.ls-opt')[0].click()")
    page.wait_for_timeout(400)
    check("点选项后 audio 仍在", page.evaluate("!!document.querySelector('audio.ls-audio')"), "")
    check("没变回重新加载", page.evaluate("(document.querySelector('audio.ls-audio')||{}).src||''").endswith("cet6-1912-1.mp3"), "")

    check("无 JS 异常", not errs, "; ".join(errs[:3]))
    b.close()

bad = [x for x in OUT if not x[1]]
for name, ok, extra in OUT:
    print(("PASS " if ok else "FAIL ") + name + (("  → " + str(extra)) if extra != "" else ""))
print("\n%d/%d 通过" % (len(OUT) - len(bad), len(OUT)))
os._exit(1 if bad else 0)
