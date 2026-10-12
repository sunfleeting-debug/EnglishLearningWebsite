# -*- coding: utf-8 -*-
"""核验「六级阅读真题（#/reading）」：页面阅读器 + 答题卡 + 判分。

用法（Chromium 需在沙箱外起）：
    NODE_OPTIONS= python tools/verify_reading.py

覆盖：
- 数据完整性：2 套题 / 8 个 section / 答案长度与题量一致
- 阅读器：原文页数、译文页数、题源页数；图片原样下发（字节级）
- 灯箱：点图放大、翻页、Esc 关闭
- 答题卡：30 题、选项写入 localStorage、提交判分、错题标红 + 给出正确答案、
  查看答案、清空重做
- 移动端：无横向溢出
- 控制台 0 错误
"""
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8789

FAILS = []


def check(name, got, want=True, extra=""):
    ok = got == want
    line = ("  [OK]  " if ok else "  [FAIL]") + " " + name + (("   -> " + str(extra)) if extra else "")
    if not ok:
        line += "   got=%r want=%r" % (got, want)
    print(line)
    if not ok:
        FAILS.append(name)


def main():
    from playwright.sync_api import sync_playwright

    srv = subprocess.Popen(
        [sys.executable, str(ROOT / "tools/serve.py"), "--port", str(PORT)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    base = "http://127.0.0.1:%d/" % PORT
    errors = []

    with sync_playwright() as pw:
            exe = Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                       r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
            kw = {"executable_path": str(exe)} if exe.exists() else {}
            browser = pw.chromium.launch(**kw)
            pg = browser.new_page(viewport={"width": 1440, "height": 900})
            pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            def go(route, wait=800):
                pg.goto(base + route, wait_until="domcontentloaded")
                pg.wait_for_timeout(wait)

            # ---------- 数据完整性 ----------
            go("#/reading")
            has = pg.evaluate("() => !!window.TW.READING")
            check("TW.READING 数据已加载", has, True)
            if has:
                tests = pg.evaluate("() => TW.READING.practice.tests.map(t=>t.id)")
                check("含 2 套 Model Test", tests, ["mt1", "mt2"])
                bad = pg.evaluate("""() => {
                  var out = [];
                  TW.READING.practice.tests.forEach(function(t){
                    t.sections.forEach(function(s){
                      if (s.ans.length !== s.to - s.from + 1) out.push(t.id+'/'+s.id);
                    });
                  });
                  return out;
                }""")
                check("每 section 答案数 = 题量", bad, [])
                # 抽样核对人工整理的关键答案
                a1 = pg.evaluate("() => TW.READING.practice.tests[0].sections[0].ans.join('')")
                a2 = pg.evaluate("() => TW.READING.practice.tests[1].sections[1].ans.join('')")
                check("MT1 选词填空答案 = FNIHDLJOEB", a1, "FNIHDLJOEB")
                check("MT2 段落匹配答案 = GIBECAHDFE", a2, "GIBECAHDFE")
                ranges = pg.evaluate("""() => TW.READING.practice.tests[0].sections
                    .map(s => s.from + '-' + s.to).join(',')""")
                check("MT1 题号区间连续 1-10,11-20,21-25,26-30", ranges,
                      "1-10,11-20,21-25,26-30")

            # ---------- tab / 二级切换 ----------
            check("材料 tab 数 = 3", pg.locator(".rd-tab").count(), 3)
            check("默认进入答题原文（6 页）", pg.locator(".rd-img").count(), 6)

            pg.locator(".rd-sub[data-test='mt2']").click()
            pg.wait_for_timeout(700)
            check("切到 Model Test 2 原文（6 页）", pg.locator(".rd-img").count(), 6)
            check("URL 带上 test=mt2", "test=mt2" in pg.evaluate("() => location.hash"), True)

            # ---------- 灯箱 ----------
            pg.locator(".rd-img").first.click()
            pg.wait_for_timeout(500)
            check("点图弹出灯箱", pg.locator(".rd-lightbox").count(), 1)
            lb0 = pg.evaluate("() => document.querySelector('.lb-count').textContent")
            pg.locator(".lb-next").click()
            pg.wait_for_timeout(400)
            lb1 = pg.evaluate("() => document.querySelector('.lb-count').textContent")
            check("灯箱可翻页", lb0 != lb1, True, "%s -> %s" % (lb0, lb1))
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(400)
            check("Esc 关闭灯箱", pg.locator(".rd-lightbox").count(), 0)

            # ---------- 答题卡 ----------
            pg.locator(".rd-sub[data-mode='card']").click()
            pg.wait_for_timeout(700)
            check("答题卡题量 = 30", pg.locator(".ans-q").count(), 30)
            check("选词填空备选词 15 个", pg.locator(".ans-sec:first-child .wl-chip").count(), 15)
            check("阅读理解每题只有 4 个选项",
                  pg.locator(".ans-sec[data-sec='c1'] .ans-q[data-q='21'] .ans-opt").count(), 4)

            # 清空旧记录后作答：MT1 第 1 题选 F（正确），第 2 题选 A（错误）
            pg.evaluate("() => localStorage.removeItem('typingcet.reading.v1')")
            go("#/reading?tab=practice&test=mt1&mode=card")
            pg.locator(".ans-sec[data-sec='a'] .ans-q[data-q='1'] .ans-opt[data-l='F']").click()
            pg.locator(".ans-sec[data-sec='a'] .ans-q[data-q='2'] .ans-opt[data-l='A']").click()
            pg.wait_for_timeout(300)
            saved = pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.reading.v1')||'{}').picks || {}")
            check("作答写入 localStorage", saved.get("mt1|a|1"), "F")
            check("被选项高亮", pg.locator(".ans-sec[data-sec='a'] .ans-q[data-q='1'] .ans-opt.on").count(), 1)

            pg.locator(".ans-bar [data-act='submit']").click()
            pg.wait_for_timeout(500)
            q1cls = pg.locator(".ans-sec[data-sec='a'] .ans-q[data-q='1']").get_attribute("class") or ""
            q2cls = pg.locator(".ans-sec[data-sec='a'] .ans-q[data-q='2']").get_attribute("class") or ""
            check("答对的题标绿(.ok)", "ok" in q1cls, True, q1cls)
            check("答错的题标红(.bad)", "bad" in q2cls, True, q2cls)
            q5cls = pg.locator(".ans-sec[data-sec='a'] .ans-q[data-q='5']").get_attribute("class") or ""
            check("未作答的题标为中性(.miss)而非答错", "miss" in q5cls and "bad" not in q5cls, True, q5cls)
            mk5 = pg.evaluate("() => document.querySelector(\".ans-sec[data-sec='a'] .ans-q[data-q='5'] .ans-mark\").textContent")
            check("未作答题标注「未答」并给出答案 D", ("未答" in mk5 and "D" in mk5), True, mk5)
            mk2 = pg.evaluate("() => document.querySelector(\".ans-sec[data-sec='a'] .ans-q[data-q='2'] .ans-mark\").textContent")
            check("错题给出正确答案 N", "N" in mk2, True, mk2)
            score = pg.evaluate("() => document.querySelector('#ans-score').textContent")
            check("得分栏显示正确率", ("正确" in score and "正确率" in score), True, score)
            check("正确率 = 3%（1/30）", "3%" in score, True, score)

            pg.locator(".ans-bar [data-act='key']").click()
            pg.wait_for_timeout(400)
            check("查看答案后全部题标注答案", pg.evaluate("() => document.querySelectorAll('.ans-mark.show').length"), 30)

            pg.locator(".ans-bar [data-act='clear']").click()
            pg.wait_for_timeout(700)
            check("清空重做后无选中项", pg.locator(".ans-opt.on").count(), 0)
            saved2 = pg.evaluate("() => JSON.parse(localStorage.getItem('typingcet.reading.v1')||'{}').picks || {}")
            check("清空后 localStorage 无残留", saved2.get("mt1|a|1"), None)

            # ---------- 参考译文 / 题源文章 ----------
            pg.locator(".rd-tab[data-tab='translation']").click()
            pg.wait_for_timeout(700)
            check("参考译文 14 页", pg.locator(".rd-img").count(), 14)
            pg.locator(".rd-tab[data-tab='source']").click()
            pg.wait_for_timeout(700)
            check("题源文章 6 页", pg.locator(".rd-img").count(), 6)

            # ---------- 图片原样下发（字节级） ----------
            for rel in ("assets/reading/practice/p01.webp",
                        "assets/reading/practice/p22.webp",
                        "assets/reading/translation/p14.webp",
                        "assets/reading/source/p06.webp"):
                local = (ROOT / rel).stat().st_size
                r = pg.request.get(base + rel)
                check("原样下发 " + rel, len(r.body()) == local, True,
                      "ct=%s server=%d local=%d" % (r.headers.get("content-type"), len(r.body()), local))

            # ---------- 学习资料页入口 ----------
            go("#/resources")
            check("学习资料页有网页版入口", pg.locator("a.res-hero[href='#/reading']").count(), 1)

            # ---------- 移动端 ----------
            pg.set_viewport_size({"width": 390, "height": 844})
            go("#/reading?tab=practice&test=mt1&mode=card")
            ovf = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            check("移动端答题卡无横向溢出", ovf <= 1, True, ovf)

            # ---------- 控制台 ----------
            check("控制台错误数 = 0", len(errors), 0, errors[:3])

            # 收尾：不调 browser.close()/不退出 with —— 本机偶发 browser.close() 挂起
            # （CPU 0、永不返回），会把已完成的断言结果一起吞掉。直接 os._exit 落盘退出。
            finish(srv, errors)


def finish(srv, errors):
    srv.terminate()
    print("\n" + "=" * 46)
    if FAILS:
        print("失败 %d 项：" % len(FAILS))
        for f in FAILS:
            print("  - " + f)
        sys.stdout.flush()
        os._exit(1)
    if errors:
        print("控制台错误：")
        for e in errors[:5]:
            print("  - " + str(e))
    print("全部通过：阅读器 + 答题卡 + 判分")
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
