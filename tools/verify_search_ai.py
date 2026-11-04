from verify_sentences import Session, static_server, browser_options, OUT
from playwright.sync_api import sync_playwright

OUT.mkdir(parents=True, exist_ok=True)
with static_server() as base, sync_playwright() as p:
    browser = p.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("""() => {
          TW.data.preloadDecks = () => {};
          TW.data.allDecksReady = () => true;
          TW.data.searchAll = q => q === 'known' ? [{word:'known', trans:['known definition']}] : [];
          TW.data.lookupChain = (q, cb) => cb(q === 'onlineword' ? {type:'online', res:{word:q,ms:[]}} : null);
          TW.ai.configured = () => window.__configured !== false;
          window.__aiCalls = [];
          TW.ai.chat = opts => {
            const q = opts.messages[0].content;
            window.__aiCalls.push(q);
            if (q.includes('failword') && !window.__retry) return Promise.reject(new Error('测试连接失败'));
            if (q.includes('slowword')) return new Promise(resolve => {window.__resolveOld = resolve;});
            return Promise.resolve({text:'AI result for ' + q + ' <img src=x onerror=alert(1)>'});
          };
        }""")
        def search(q): page.locator('#hs-input').fill(q)
        search('missingword')
        page.get_by_text('AI result for missingword', exact=False).wait_for(timeout=8000)
        assert page.locator('#hs-res img').count() == 0
        assert page.evaluate('() => window.__aiCalls.length') == 1
        print('PASS missing word receives escaped AI answer automatically', flush=True)
        search('known'); page.locator('.hs-item').first.wait_for(); page.wait_for_timeout(1000)
        assert page.evaluate('() => window.__aiCalls.length') == 1
        search('onlineword'); page.locator('#hs-online-detail').wait_for(); page.wait_for_timeout(1000)
        assert page.evaluate('() => window.__aiCalls.length') == 1
        print('PASS dictionary results do not invoke AI', flush=True)
        search('slowword'); page.wait_for_function('() => !!window.__resolveOld', timeout=8000)
        search('missingword2'); page.get_by_text('AI result for missingword2', exact=False).wait_for(timeout=8000)
        page.evaluate("() => window.__resolveOld({text:'STALE RESULT'})")
        page.wait_for_timeout(200)
        assert 'STALE RESULT' not in page.locator('#hs-res').inner_text()
        print('PASS old AI reply cannot replace a newer search', flush=True)
        search('failword'); page.get_by_text('测试连接失败', exact=False).wait_for(timeout=8000)
        page.evaluate('() => { window.__retry = true; }')
        page.get_by_role('button', name='重试').click()
        page.get_by_text('AI result for failword', exact=False).wait_for(timeout=8000)
        print('PASS failed AI request shows error and can be retried', flush=True)
        page.evaluate('() => { window.__configured = false; }')
        search('unconfiguredword'); page.get_by_text('配置 AI', exact=False).first.wait_for(timeout=8000)
        print('PASS missing AI configuration is explained', flush=True)
        session.goto('#/home')
        page.evaluate("""() => {
          TW.data.allDecksReady = () => false;
          TW.data.preloadDecks = cb => cb(1, 1);
          TW.data.searchAll = () => [];
          TW.data.lookupChain = (q, cb) => cb(null);
          TW.ai.configured = () => true;
          TW.ai.chat = async () => ({text:'Fallback after failed dictionary'});
        }""")
        search('dictionaryfailed')
        page.get_by_text('Fallback after failed dictionary').wait_for(timeout=5000)
        print('PASS AI fallback still works after dictionary load failure', flush=True)
    finally:
        session.close(); browser.close()
