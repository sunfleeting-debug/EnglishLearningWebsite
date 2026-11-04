from verify_sentences import Session, static_server, browser_options, OUT
from playwright.sync_api import sync_playwright

OUT.mkdir(parents=True, exist_ok=True)
with static_server() as base, sync_playwright() as p:
    browser = p.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("""() => {
          window.__studyCalls = [];
          TW.ai.configured = () => true;
          TW.ai.chat = async opts => {window.__studyCalls.push(opts); return {text:'测试回答 ' + opts.messages.length};};
        }""")
        baseline = page.evaluate("() => localStorage.getItem('typingcet.ai.chat.v1')")
        writing = page.evaluate("() => TW_WRITING.items.find(x => x.type === 'essay')")
        page.evaluate('(id) => location.hash = "/writing?id=" + encodeURIComponent(id)', writing['id'])
        page.locator('#wr-input').wait_for()
        page.locator('#wr-input').fill('My personal draft for practice.')
        page.locator('#study-chat-input').fill('请分析我的作答')
        page.locator('#study-chat-send').click()
        page.get_by_text('测试回答 1').wait_for()
        assert 'My personal draft for practice.' in str(page.evaluate('() => window.__studyCalls[0]'))
        page.locator('#study-chat-input').fill('请继续解释')
        page.locator('#study-chat-send').click()
        page.get_by_text('测试回答 3').wait_for()
        page.locator('#wr-tips').click()
        assert page.get_by_text('测试回答 3').count() == 1
        print('PASS writing conversation sees current draft and survives redraw', flush=True)
        trans = page.evaluate("() => TW_WRITING.items.find(x => x.type === 'trans')")
        page.evaluate('(id) => location.hash = "/writing?id=" + encodeURIComponent(id)', trans['id'])
        page.locator('#study-chat-input').wait_for()
        assert page.get_by_text('测试回答 3').count() == 0
        page.locator('#study-chat-input').fill('请分析这道翻译')
        page.locator('#study-chat-send').click()
        page.get_by_text('测试回答 1').wait_for()
        assert trans['prompt'][:15] in str(page.evaluate('() => window.__studyCalls.at(-1)'))
        print('PASS translation has separate context and resets on navigation', flush=True)
        quiz = page.evaluate("() => TW.quiz.bank().find(x => x.type === 'reading')")
        page.evaluate('(id) => location.hash = "/quiz?set=" + encodeURIComponent(id)', quiz['id'])
        page.locator('#study-chat-input').wait_for()
        page.locator('[data-q]').first.click()
        page.locator('#study-chat-input').fill('分析我目前的选择')
        page.locator('#study-chat-send').click()
        page.get_by_text('测试回答 1').wait_for()
        assert quiz['title'] in str(page.evaluate('() => window.__studyCalls.at(-1)'))
        assert 'answers' in str(page.evaluate('() => window.__studyCalls.at(-1)'))
        page.locator('#qz-toggle-body').click()
        assert page.get_by_text('测试回答 1').count() == 1
        print('PASS quiz conversation includes answer context and survives redraw', flush=True)
        listen = page.evaluate('() => TW_LISTENING.sets[0]')
        page.evaluate('(id) => location.hash = "/listening?id=" + encodeURIComponent(id)', listen['id'])
        page.locator('#study-chat-input').wait_for()
        page.locator('.ls-opt').first.click()
        page.locator('#study-chat-input').fill('请讲讲我的听力选择')
        page.locator('#study-chat-send').click()
        page.get_by_text('测试回答 1').wait_for()
        last = str(page.evaluate('() => window.__studyCalls.at(-1)'))
        assert listen['title'] in last and 'answers' in last and 'One of Britain' in last, last[:1500]
        page.locator('#ls-text').click()
        assert page.get_by_text('测试回答 1').count() == 1
        assert baseline == page.evaluate("() => localStorage.getItem('typingcet.ai.chat.v1')")
        print('PASS listening conversation includes transcript and answers without saving history', flush=True)
        page.evaluate("""() => { TW.ai.chat = () => new Promise(resolve => {window.__resolveStudy = resolve;}); }""")
        page.locator('#study-chat-input').fill('请继续分析')
        page.locator('#study-chat-send').click()
        page.wait_for_function('() => !!window.__resolveStudy')
        page.locator('#ls-text').click()
        assert '正在分析' in page.locator('#study-chat-messages').inner_text()
        page.evaluate("() => window.__resolveStudy({text:'Delayed answer'})")
        page.get_by_text('Delayed answer').wait_for()
        print('PASS in-flight conversation survives redraw', flush=True)
        page.evaluate("() => location.hash = '/home'")
        page.evaluate('(id) => location.hash = "/listening?id=" + encodeURIComponent(id)', listen['id'])
        page.locator('#study-chat-input').wait_for()
        assert page.get_by_text('测试回答 1').count() == 0
        print('PASS leaving and returning clears the conversation', flush=True)
    finally:
        session.close(); browser.close()
