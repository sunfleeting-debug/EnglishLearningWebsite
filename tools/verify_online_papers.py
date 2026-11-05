"""Exercise the published paper bundle without selecting a local folder."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
from verify_sentences import Session, browser_options, static_server

root = Path(__file__).resolve().parent.parent
source = json.loads((root / '星火六级' / '英语学习站-自动判分题库.json').read_text(encoding='utf-8'))
with static_server() as base, sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202112-1-reading-1'")
        reading = next(s for s in source['sets'] if s['id'] == 'personal-cet6-202112-1-reading-1')
        for question in reading['questions']:
            page.locator(f'[data-q="{question["n"]}"][data-val="{question["answer"]}"]').click()
        page.locator('#qz-submit').click()
        assert page.locator('.qz-score b').inner_text() == '5/5'
        page.evaluate("() => location.hash='/quiz?set=personal-cet6-202112-1-listening'")
        audio = page.locator('#qz-local-audio audio')
        audio.wait_for()
        assert audio.get_attribute('src').startswith('audio/personal-papers/')
        audio.evaluate("audio => audio.play()")
        page.wait_for_function("() => { const a=document.querySelector('#qz-local-audio audio'); return a && a.currentTime > 0; }")
        page.evaluate("() => location.hash='/writing?id=personal-cet6-202112-1-essay'")
        page.get_by_text('Young people spend a lot of time on the Internet.', exact=False).first.wait_for()
        assert page.evaluate("() => TW.personalMaterials.quizSets().length") == len(source['sets'])
        assert page.evaluate("() => TW.personalMaterials.writingItems().length") == len(source['writing'])
        print('PASS: online quiz, score, real audio and writing without a local folder')
    finally:
        session.close()
        browser.close()
