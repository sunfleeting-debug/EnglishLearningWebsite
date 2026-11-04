# -*- coding: utf-8 -*-
"""给这一轮改动拍几张图：统计页场次明细 / 生词本最近学过 / 分页跳转。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "_shots"
OUT.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:5173/"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 1000})
    pg.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
    pg.goto(BASE + "#/home", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.TW && TW.store && TW.data.words")
    pg.wait_for_timeout(400)

    pg.evaluate("""() => {
        const S = TW.store; S.resetAll(); const now = Date.now();
        const ws = TW.data.words.slice(0, 10);
        const marks = [3*60000, 25*60000, 2*3600e3, 5*3600e3, 20*3600e3, 2*86400e3, 3*86400e3, 6*86400e3, 12*86400e3, 25*86400e3];
        ws.forEach((w, i) => {
            const p = S.state.progress[w.id] = S.state.progress[w.id] || {};
            p.w = i % 3 === 0 ? (i % 4) + 1 : 0; p.r = 3; p.seen = 6; p.fav = false; p.master = false;
            p.ts = now - marks[i]; p.word = w.word; p.src = w.book || '';
            p.brief = TW.data.brief(w); p.streak = 0;
        });
        for (let k = 0; k < 12; k++) {
            const a = ws[k % ws.length], c = ws[(k + 2) % ws.length];
            const wrongN = (k * 3) % 5;
            S.addSession({
                t: now - k * 7 * 60000, mode: ['listen','type','recall','card'][k % 4],
                src: ['srs','book','srs','collection'][k % 4],
                total: 6, right: 6 - wrongN, wrong: wrongN,
                acc: Math.round((6 - wrongN) / 6 * 100),
                detail: [
                    { id: a.id, word: a.word, ok: k % 2 },
                    { id: c.id, word: c.word, ok: 0 },
                    { id: ws[(k + 5) % ws.length].id, word: ws[(k + 5) % ws.length].word, ok: 1 }
                ]
            });
        }
        ws.slice(0, 5).forEach(w => S.srs.enroll(w.word, w.book || '', TW.data.brief(w)));
        S.save();
    }""")
    pg.wait_for_timeout(300)

    # 统计页：点开第一场明细
    pg.goto(BASE + "#/stats", wait_until="domcontentloaded")
    pg.wait_for_selector(".sess-row", timeout=8000)
    pg.wait_for_timeout(400)
    pg.locator(".sess-row").first.click()
    pg.wait_for_timeout(300)
    pg.locator(".sess-row").first.scroll_into_view_if_needed()
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / "stats-01-sess-detail.png"))

    # 生词本最近学过
    pg.goto(BASE + "#/review?tab=recent&range=7d", wait_until="domcontentloaded")
    pg.wait_for_selector("#rv-list", timeout=8000)
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / "review-01-recent.png"))

    # 分页：词库末页
    pg.goto(BASE + "#/books?book=all", wait_until="domcontentloaded")
    pg.wait_for_selector("#books-body .pager", timeout=10000)
    pg.wait_for_timeout(400)
    pg.locator(".pager").scroll_into_view_if_needed()
    pg.wait_for_timeout(200)
    pg.screenshot(path=str(OUT / "books-01-pager.png"))

    # 移动端：生词本 + 分页
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
    m.goto(BASE + "#/home", wait_until="domcontentloaded")
    m.wait_for_function("() => window.TW && TW.store && TW.data.words")
    m.wait_for_timeout(400)
    m.evaluate("""() => {
        const S = TW.store; S.resetAll(); const now = Date.now();
        TW.data.words.slice(0, 6).forEach((w, i) => {
            const p = S.state.progress[w.id] = {};
            p.w = 1; p.r = 2; p.seen = 4; p.ts = now - i * 3600e3; p.word = w.word;
            p.src = w.book || ''; p.brief = TW.data.brief(w);
        });
        S.save();
    }""")
    m.goto(BASE + "#/review?tab=recent", wait_until="domcontentloaded")
    m.wait_for_timeout(500)
    m.screenshot(path=str(OUT / "review-02-mobile.png"))

    m.goto(BASE + "#/books?book=all", wait_until="domcontentloaded")
    m.wait_for_selector(".pager", timeout=10000)
    m.wait_for_timeout(400)
    m.locator(".pager").scroll_into_view_if_needed()
    m.wait_for_timeout(200)
    m.screenshot(path=str(OUT / "books-02-pager-mobile.png"))

    b.close()
print("shots ->", OUT)
