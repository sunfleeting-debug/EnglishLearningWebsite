import json
from pathlib import Path

from verify_sentences import Session, static_server, browser_options
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
bundle = json.loads((root / '星火六级' / '英语学习站-自动判分题库.json').read_text(encoding='utf-8'))
with static_server() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate('''bundle => {
          const root = {
            kind: 'directory', name: '星火六级',
            async *values() { yield {kind:'file', name:'试卷.pdf'}; },
            async getFileHandle(name) {
              if (name !== '英语学习站-自动判分题库.json') throw new DOMException('', 'NotFoundError');
              return {getFile: async () => new File([JSON.stringify(bundle)], name)};
            },
            async getDirectoryHandle() { return {getDirectoryHandle:this.getDirectoryHandle, getFileHandle:async name => ({getFile:async()=>{
              const bytes = new Uint8Array(44 + 16000 * 8), v = new DataView(bytes.buffer);
              const put = (i,s) => [...s].forEach((c,j)=>v.setUint8(i+j,c.charCodeAt(0)));
              put(0,'RIFF'); v.setUint32(4,bytes.length-8,true); put(8,'WAVE'); put(12,'fmt ');
              v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
              v.setUint32(24,8000,true); v.setUint32(28,16000,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
              put(36,'data'); v.setUint32(40,bytes.length-44,true);
              return new File([bytes],name,{type:'audio/wav'});
            }})}; }
          };
          window.showDirectoryPicker = async () => root;
          location.hash = '/quiz';
        }''', bundle)
        page.locator('#pm-choose').wait_for()
        page.locator('#pm-choose').click()
        page.get_by_text('已加载本机可判分题目：21 组、165 题。').wait_for()
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-reading-1"]').click()
        for question in next(x for x in bundle['sets'] if x['id'].endswith('reading-1'))['questions']:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '5/5'
        page.evaluate("() => location.hash='/quiz'")
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-matching"]').click()
        for question in next(x for x in bundle['sets'] if x['type'] == 'match')['questions']:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '10/10'
        page.evaluate("() => location.hash='/quiz'")
        page.locator('a[href="#/quiz?set=personal-cet6-202512-3-match"]').click()
        latest_match = next(x for x in bundle['sets'] if x['id'] == 'personal-cet6-202512-3-match')
        assert len(latest_match['paras']) == 18
        for question in latest_match['questions']:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '10/10'
        page.evaluate("() => location.hash='/quiz'")
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-cloze"]').click()
        for question in next(x for x in bundle['sets'] if x['type'] == 'cloze')['questions']:
            page.locator(f'[data-blank="{question["n"]}"]').click()
            page.locator(f'[data-word="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '10/10'
        page.evaluate("() => location.hash='/listening'")
        page.get_by_text('本机真题听力').wait_for()
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-listening"]').click()
        page.locator('#qz-local-audio audio').wait_for()
        assert page.locator('#qz-local-audio audio').get_attribute('src').startswith('blob:')
        page.locator('#qz-local-audio audio').evaluate('(audio) => audio.play()')
        listen_questions = next(x for x in bundle['sets'] if x['type'] == 'listening')['questions']
        first = listen_questions[0]
        page.locator(f'[data-q="{first["n"]}"][data-val="{first["answer"]}"]').click()
        assert not page.locator('#qz-local-audio audio').evaluate('(audio) => audio.paused')
        for question in listen_questions[1:]:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '25/25'
        page.evaluate("() => location.hash='/writing'")
        page.locator('a[href="#/writing?id=personal-cet6-202112-1-essay"]').click()
        page.get_by_text('Young people spend a lot of time on the Internet.', exact=False).first.wait_for()
        page.locator('#wr-input').fill('A practice response.')
        page.evaluate("() => location.hash='/writing'")
        page.locator('a[href="#/writing?id=personal-cet6-202112-1-essay"]').click()
        assert page.locator('#wr-input').input_value() == 'A practice response.'
        assert page.locator('#wr-ref').count() == 0
        print('PASS: local quiz, audio, scores, writing prompts and drafts')
    finally:
        session.close()
        browser.close()
