from verify_sentences import Session, static_server, browser_options, OUT
from playwright.sync_api import sync_playwright

OUT.mkdir(parents=True, exist_ok=True)
with static_server() as base, sync_playwright() as p:
    browser = p.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("""() => { TW.sentences.setSetting('mode','recall'); TW.ai.chat = async () => ({text:'{\"correct\":true,\"feedback\":\"意思正确\"}'}); }""")
        session.courses(); session.start()
        page.locator('#sentence-input').fill('This is an alternative translation.')
        page.locator('#sentence-submit').click()
        page.locator('#sentence-next').wait_for()
        assert session.current()['session']['phase'] == 'correct'
        print('PASS translation accepts a semantic verdict in the page', flush=True)
        word = page.evaluate("() => TW.data.words[0]")
        session.goto('#/word?id=' + str(word['id']))
        page.locator('#dc-ai-form').wait_for()
        page.evaluate("""() => { TW.ai.configured = () => true; TW.ai.chat = async p => ({text:'解释 ' + p.messages.length}); }""")
        page.locator('#dc-ai-input').fill('这个词怎么用？')
        page.locator('#dc-ai-form button').click()
        page.get_by_text('解释 1').wait_for()
        page.locator('#dc-ai-input').fill('还有什么搭配？')
        page.locator('#dc-ai-form button').click()
        page.get_by_text('解释 3').wait_for()
        session.goto('#/home')
        session.goto('#/word?id=' + str(word['id']))
        page.locator('#dc-ai-form').wait_for()
        assert page.get_by_text('解释 3').count() == 0
        print('PASS word chat follows up and resets after leaving', flush=True)
        page.evaluate("""() => {
          TW.ai.configured = () => true;
          TW.ai.streamChat = async () => ({text:'Here is your exercise.\\n```material\\n' + JSON.stringify(window.__material) + '\\n```'});
          location.hash = '/ai';
        }""")
        page.locator('#ai-input').wait_for()
        writing = {'kind':'writing','type':'essay','title':'Targeted writing','prompt':'Describe your study habits.'}
        listening = {'kind':'listening','title':'Targeted listening','transcript':'Students practice every day.', 'questions':[{'stem':'Who practices?', 'options':['Students','Teachers','Drivers','Visitors'], 'answer':'A'}]}
        for material in (writing, listening):
            page.evaluate('(material) => { window.__material = material; }', material)
            page.locator('#ai-input').fill('请给我生成练习')
            page.locator('#ai-send').click()
            button = page.locator('[data-act="publish-material"]').last
            button.wait_for()
            button.click()
            assert button.inner_text() == '已保存'
        page.evaluate("() => { location.hash = '/writing'; }")
        page.get_by_text('Targeted writing').wait_for()
        page.evaluate("() => { location.hash = '/listening'; }")
        page.get_by_text('Targeted listening').wait_for()
        print('PASS AI-generated materials publish to writing and listening', flush=True)
    finally:
        session.close(); browser.close()
