"""Exercise listening text and subject charts in an isolated browser."""
from playwright.sync_api import sync_playwright
from verify_sentences import Session, browser_options, static_server

with static_server() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202312-1-listening'")
        page.get_by_role('button', name='查看原文与译文').click()
        page.get_by_text('M: Hello, doctor.').wait_for()
        page.get_by_text('男：你好，医生。').wait_for()
        page.locator('[data-q]').first.click()
        page.get_by_text('M: Hello, doctor.').wait_for()
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202106-1-listening'")
        page.get_by_text('完整原文与译文 · 原册').click()
        page.get_by_alt_text('完整原文与译文 · 原册 第 1 页，点击放大').wait_for()
        assert page.locator('img[alt^="完整原文与译文 · 原册"]').count() == 27
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202406-1-listening'")
        page.get_by_text('完整英文原文 · 原册').click()
        page.get_by_alt_text('完整英文原文 · 原册 第 1 页，点击放大').wait_for()
        page.get_by_text('完整中文译文 · 原册').click()
        page.get_by_alt_text('完整中文译文 · 原册 第 1 页，点击放大').wait_for()
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202512-2-listening'")
        page.get_by_text('这套听力的完整中文译文还在整理。').wait_for()
        page.get_by_text('完整英文原文 · 原册').click()
        page.get_by_alt_text('完整英文原文 · 原册 第 1 页，点击放大').wait_for()
        page.evaluate("""() => {
          localStorage.setItem('typingcet.listen.v1', JSON.stringify({results: {sample: {right: 8, total: 10, ts: Date.now()}}}));
          const item = TW_WRITING.items.find(x => x.type === 'trans');
          localStorage.setItem('typingcet.write.v1', JSON.stringify({results: {[item.id]: {score: 12, max: 15, ts: Date.now()}}}));
          location.hash = '/stats';
        }""")
        page.get_by_text('专项学习').wait_for()
        for title in ('题目', '听力', '翻译', '作文'):
            page.locator('.st-card').filter(has=page.locator('.card-title', has_text=title)).first.wait_for()
        assert '1 套' in page.locator('.st-card').filter(has=page.locator('.card-title', has_text='听力')).first.inner_text()
        assert '80%' in page.locator('.st-card').filter(has=page.locator('.card-title', has_text='翻译')).first.inner_text()
        print('PASS listening transcript, translation and separate subject charts')
    finally:
        session.close()
        browser.close()
