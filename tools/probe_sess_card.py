# -*- coding: utf-8 -*-
"""统计页「近期场次正确率」卡探针：
1) 练习 finish 真实落一条场次记录（注入假会话更快，但也要验证 addSession 接口在）；
2) 打开 #/stats 断言 .sess-row 渲染、百分比文本正确。
用法：NODE_OPTIONS= python -u tools/probe_sess_card.py
"""
import os, pathlib

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")

fails = []


def check(name, cond):
    print(("[OK]   " if cond else "[FAIL] ") + name)
    if not cond:
        fails.append(name)


def main():
    with sync_playwright() as p:
        pg = p.chromium.launch(executable_path=str(EXE), headless=True).new_page()
        # 登录门对测试放行
        pg.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
        pg.goto(BASE + "#/home", wait_until="domcontentloaded")
        pg.wait_for_function("() => window.TW && TW.store && TW.app")

        # 接口存在性
        check("TW.store.addSession 接口存在", pg.evaluate("() => typeof TW.store.addSession === 'function'"))
        check("TW.store.sessions 接口存在", pg.evaluate("() => typeof TW.store.sessions === 'function'"))

        # 注入 3 条场次记录（80/60/40 正确率，覆盖 ok/主题色/err 三档）+ 今天的 daily（让 14 天图例出现正确率）
        pg.evaluate("""() => {
            const now = Date.now();
            TW.store.state.sessions = [
                { t: now - 3600e3, mode: 'type', src: 'srs', total: 20, right: 16, wrong: 4, acc: 80 },
                { t: now - 7200e3, mode: 'listen', src: 'book', total: 20, right: 12, wrong: 8, acc: 60 },
                { t: now - 3 * 86400e3, mode: 'card', src: 'collection', total: 10, right: 4, wrong: 6, acc: 40 },
            ];
            TW.store.state.daily[TW.store.today()] = { done: 50, right: 40 };
            TW.store.save();
        }""")
        pg.goto(BASE + "#/stats", wait_until="domcontentloaded")
        pg.wait_for_timeout(800)

        info = pg.evaluate("""() => {
            const title = [...document.querySelectorAll('.card-title')].some(el => el.textContent.includes('近期场次正确率'));
            const rows = [...document.querySelectorAll('.sess-row')];
            return {
                title,
                n: rows.length,
                texts: rows.map(r => r.textContent),
                accs: rows.map(r => { const el = r.querySelector('.sess-acc'); return el ? el.textContent : ''; }),
                widths: rows.map(r => { const el = r.querySelector('.progress-line > i'); return el ? el.style.width : ''; }),
            };
        }""")
        check("统计页出现「近期场次正确率」卡", info["title"])
        check("渲染 3 行场次记录", info["n"] == 3)
        check("百分比依次为 80% / 60% / 40%", info["accs"] == ["80%", "60%", "40%"])
        check("进度条宽度与正确率一致", info["widths"] == ["80%", "60%", "40%"])
        check("场次行含模式与来源文案", all(("看词打字" in t or "听音写词" in t or "翻卡记忆" in t) for t in info["texts"]))
        check("14 天图例含整体正确率", pg.evaluate(
            "() => [...document.querySelectorAll('.bar-legend span')].some(el => el.textContent.includes('正确率'))"))

        # 空态：清空场次后应显示空提示而不是报错。
        # SPA 相同 hash 不触发 hashchange ⇒ 先回 home 再进 stats 强制重渲染。
        pg.evaluate("() => { TW.store.state.sessions = []; TW.store.save(); }")
        pg.goto(BASE + "#/home", wait_until="domcontentloaded")
        pg.wait_for_timeout(400)
        pg.goto(BASE + "#/stats", wait_until="domcontentloaded")
        pg.wait_for_timeout(600)
        check("无场次时显示空态文案", pg.evaluate(
            "() => document.body.textContent.includes('完成一轮练习或复习后')"))

        print("\n结论：", "✅ 场次正确率卡全部通过" if not fails else "❌ 有 %d 项失败" % len(fails))
        return 0 if not fails else 1


if __name__ == "__main__":
    os._exit(main())
