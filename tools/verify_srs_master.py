from playwright.sync_api import sync_playwright
from verify_sentences import Session, browser_options, static_server

with static_server() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        words = page.evaluate('''() => {
          const [a,b] = TW.data.words;
          TW.store.srs.enroll(a.word, a.book, '');
          TW.store.srs.enroll(b.word, b.book, '');
          TW.store.toggleMaster(a.id);
          location.hash = '/srs';
          return {a: a.word, b: b.word, id: a.id};
        }''')
        page.locator('.srs-row').first.wait_for()
        assert page.locator('.srs-row').count() == 1
        assert page.locator('.srs-row').first.get_attribute('data-w') == words['b']
        page.locator('#sr-start').click()
        page.wait_for_function("() => location.hash.includes('src=srs')")
        assert page.evaluate('''word => TW.store.srs.dueList().every(r => r.w !== word)''', words['a'])
        page.evaluate('''id => { TW.store.toggleMaster(id); location.hash='/srs'; }''', words['id'])
        page.wait_for_function("() => document.querySelectorAll('.srs-row').length === 2")
        print('PASS mastered word hidden from scheduled review and restored after unmarking')
    finally:
        session.close()
        browser.close()
