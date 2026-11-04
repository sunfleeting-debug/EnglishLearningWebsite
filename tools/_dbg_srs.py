import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    pg.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
    pg.goto(BASE + "#/home", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.TW && TW.store")
    out = pg.evaluate("""() => {
        TW.store.resetAll();
        const st = TW.store;
        const r0 = st.srs.enroll('enroll', 'book1', 'v. 登记');
        const before = Object.assign({}, st.state.srs['enroll']);
        st.srs.onResult('enroll', true, 'book1', 'v. 登记');
        const afterOk = Object.assign({}, st.state.srs['enroll']);
        const due1 = st.srs.dueList().map(r => r.w);
        st.srs.onResult('enroll', false, 'book1', 'v. 登记');
        const afterBad = Object.assign({}, st.state.srs['enroll']);
        const due2 = st.srs.dueList().map(r => r.w);
        return { today: st.today(), before, afterOk, due1, afterBad, due2 };
    }""")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    b.close()
