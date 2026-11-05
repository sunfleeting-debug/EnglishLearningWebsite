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
            }
          };
          window.showDirectoryPicker = async () => root;
          location.hash = '/quiz';
        }''', bundle)
        page.locator('#pm-choose').wait_for()
        page.locator('#pm-choose').click()
        page.get_by_text('已加载本机可判分题目：4 组、30 题。').wait_for()
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-reading-1"]').click()
        for question in bundle['sets'][2]['questions']:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '5/5'
        page.evaluate("() => location.hash='/quiz'")
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-matching"]').click()
        for question in bundle['sets'][1]['questions']:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '10/10'
        page.evaluate("() => location.hash='/quiz'")
        page.locator('a[href="#/quiz?set=personal-cet6-202112-1-cloze"]').click()
        for question in bundle['sets'][0]['questions']:
            page.locator(f'[data-blank="{question["n"]}"]').click()
            page.locator(f'[data-word="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '10/10'
        print('PASS: local graded bank loads and correctly grades reading, matching and cloze')
    finally:
        session.close()
        browser.close()
