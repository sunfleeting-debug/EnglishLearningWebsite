# -*- coding: utf-8 -*-
"""题目板块视觉核验截图（列表 / 选词填空作答与交卷 / 仔细阅读译文 / 段落匹配 / 深色 / 移动端）。

用法：
    NODE_OPTIONS= python -u tools/serve.py -p 5173   # 另一个窗口起服务
    NODE_OPTIONS= python -u tools/shot_quiz.py
输出：tools/_shots/qz-*.png（该目录已 gitignore）
"""
import pathlib

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
OUT = pathlib.Path("tools/_shots")
OUT.mkdir(parents=True, exist_ok=True)


def shot(pg, name, wait=350):
    pg.wait_for_timeout(wait)
    pg.screenshot(path=str(OUT / ("qz-%s.png" % name)), full_page=True)
    print("  ✓ qz-%s.png" % name)


def main():
    with sync_playwright() as p:
        kw = {"headless": True}
        if EXE.exists():
            kw["executable_path"] = str(EXE)
        browser = p.chromium.launch(**kw)
        pg = browser.new_page(viewport={"width": 1280, "height": 900})
        pg.add_init_script("try{localStorage.setItem('typingcet.guest','1');"
                           "localStorage.removeItem('typingcet.quiz.v1');}catch(e){}")

        pg.goto(BASE + "#/quiz", wait_until="domcontentloaded")
        pg.wait_for_selector(".qz-card", timeout=8000)
        shot(pg, "01-list")

        # 选词填空：点 10 个词库里的词（选完自动跳到下一个空），再交卷
        pg.click(".qz-card[href*='mt1-p1']")
        pg.wait_for_selector(".qz-bank", timeout=8000)
        shot(pg, "02-cloze-blank")
        for i in range(10):
            # 每次点完都会整页重渲染，旧的 ElementHandle 会失效 —— 必须用 locator 现取
            pg.locator(".qz-word").nth(i).click()
        shot(pg, "03-cloze-filled")
        pg.click("#qz-submit")
        pg.wait_for_selector(".qz-score", timeout=5000)
        shot(pg, "04-cloze-graded")

        # 仔细阅读：选几个错项 → 交卷 → 展开参考译文
        pg.goto(BASE + "#/quiz?set=mt1-p3", wait_until="domcontentloaded")
        pg.wait_for_selector(".qz-opt", timeout=8000)
        n_opts = pg.locator(".qz-opt").count()
        for i in range(0, min(n_opts, 8), 4):
            pg.locator(".qz-opt").nth(i).click()
        pg.click("#qz-submit")
        pg.wait_for_selector(".qz-score", timeout=5000)
        tr = pg.query_selector("#qz-toggle-tr")
        if tr:
            tr.click()
        shot(pg, "05-reading-graded")

        # 段落匹配
        pg.goto(BASE + "#/quiz?set=mt1-p2", wait_until="domcontentloaded")
        pg.wait_for_selector(".qz-letters", timeout=8000)
        shot(pg, "06-match")

        # 深色
        pg.evaluate("() => { TW.store.setSetting('theme','dark'); document.documentElement.classList.add('dark'); }")
        pg.goto(BASE + "#/quiz", wait_until="domcontentloaded")
        pg.wait_for_selector(".qz-card", timeout=8000)
        shot(pg, "07-list-dark")

        # 移动端
        mob = browser.new_page(viewport={"width": 390, "height": 844})
        mob.add_init_script("try{localStorage.setItem('typingcet.guest','1');}catch(e){}")
        mob.goto(BASE + "#/quiz?set=mt1-p1", wait_until="domcontentloaded")
        mob.wait_for_selector(".qz-bank", timeout=8000)
        shot(mob, "08-mobile-cloze")
        overflow = mob.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 1")
        print("  移动端横向溢出：", overflow)

        browser.close()


if __name__ == "__main__":
    main()
