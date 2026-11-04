import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
    pg.goto(BASE + "#/home", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.TW && TW.store")

    # 造 6 个今天到期的词（用真实词库里的词）
    pg.evaluate("""() => {
        TW.store.resetAll();
        const ws = TW.data.words.slice(0, 6);
        ws.forEach(w => TW.store.srs.enroll(w.word, w.book || '', TW.data.brief(w)));
        return ws.map(w => w.word);
    }""")
    due_before = pg.evaluate("() => TW.store.srs.dueList().map(r => r.w)")
    print("due before:", due_before)

    for rnd in range(2):
        pg.evaluate("() => { location.hash = '#/practice?src=srs&mode=type&size=6'; }")
        pg.wait_for_timeout(1200)
        pg.wait_for_selector("#p-input", timeout=15000)
        pg.wait_for_timeout(300)
        got = []
        for i in range(6):
            cur = pg.evaluate("""() => {
                // 当前题目：从 SRS/会话里拿不到，改从页面上的隐藏信息判断不方便；
                // 直接读输入框上方标题里的词形不靠谱（打字模式确实显示词），改用 store 侧判断
                return document.querySelector('#p-input') ? 1 : 0;
            }""")
            # 打字模式显示英文词，直接从 DOM 读
            word = pg.evaluate("""() => {
                const el = document.querySelector('.word-display');
                return el ? el.textContent.trim() : '';
            }""")
            if not word:
                break
            got.append(word)
            pg.fill("#p-input", word)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(250)
            # 反馈页：Enter 继续
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(250)
        due_after = pg.evaluate("() => TW.store.srs.dueList().map(r => r.w)")
        print("round", rnd + 1, "words:", got)
        print("round", rnd + 1, "due after:", due_after)

    print("errors:", errs)
    b.close()
