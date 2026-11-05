"""Check reference notes and the AI actions in an isolated browser."""
from playwright.sync_api import sync_playwright
from verify_sentences import Session, browser_options, static_server

with static_server() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202012-1-reading-1'")
        page.get_by_role('button', name='看参考译文').click()
        page.get_by_text('参考译文 · 配套解析册').wait_for()
        page.locator('.qz-tr').get_by_text('卢浮宫', exact=False).wait_for()
        page.locator('#qz-submit').click()
        assert '卢浮宫' in page.locator('.qz-exp-t').first.inner_text()
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202512-1-reading-1'")
        page.get_by_role('button', name='AI 翻译文章').wait_for()
        page.evaluate("""() => {
          TW.ai.configured = () => true;
          TW.ai.chat = async request => { window.__paperRequest = request; return {text:'这是一段测试译文。'}; };
        }""")
        page.get_by_role('button', name='AI 翻译文章').click()
        page.get_by_text('这是一段测试译文。').wait_for()
        assert '翻译' in page.evaluate('window.__paperRequest.messages.at(-1).content')
        assert page.get_by_role('button', name='AI 分析文章').count() == 1
        print('PASS reference translation, question rationale and AI actions')
    finally:
        session.close()
        browser.close()
