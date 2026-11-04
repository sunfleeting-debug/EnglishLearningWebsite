from verify_sentences import Session, static_server, browser_options, OUT
from playwright.sync_api import sync_playwright

OUT.mkdir(parents=True, exist_ok=True)
with static_server() as base, sync_playwright() as p:
    browser = p.chromium.launch(**browser_options())
    session = Session(browser, base)
    page = session.page
    try:
        page.evaluate("""() => {
          function file(name, type) { return {kind:'file',name,getFile:async()=>new File(['sample'],name,{type})}; }
          function dir(name,items) { return {kind:'directory',name,async *values(){for(const x of items) yield x;},queryPermission:async()=> 'granted'}; }
          window.showDirectoryPicker=async()=>dir('星火六级',[
            dir('2025年六级真题',[file('2025试卷.pdf','application/pdf'),file('2025答案.pdf','application/pdf'),file('2025听力.mp3','audio/mpeg')]),
            dir('作文翻译',[file('写作100篇.pdf','application/pdf'),file('翻译.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')]),
            dir('四级资料',[file('四级试卷.pdf','application/pdf')]),
            file('ignored.jpg','image/jpeg')]);
          location.hash='/quiz';
        }""")
        page.locator('#pm-choose').wait_for()
        page.locator('#pm-choose').click()
        page.get_by_text('2025试卷.pdf',exact=True).wait_for(timeout=10000)
        page.screenshot(path=str(OUT / 'personal-materials.png'),full_page=True)
        assert page.get_by_text('四级试卷.pdf',exact=True).count() == 0
        page.locator('#pm-level').select_option('all')
        assert page.get_by_text('四级试卷.pdf',exact=True).count() == 1
        page.locator('#pm-level').select_option('six')
        page.locator('#pm-search').fill('2025试卷')
        assert page.locator('.pm-file').count() == 1
        page.get_by_text('2025试卷.pdf',exact=True).click()
        page.locator('#pm-viewer iframe').wait_for()
        assert page.locator('#pm-viewer iframe').get_attribute('src').startswith('blob:')
        page.locator('#pm-close').click()
        page.evaluate("() => location.hash='/writing'")
        page.get_by_text('写作100篇.pdf',exact=True).wait_for()
        page.get_by_text('翻译.docx',exact=True).click()
        page.get_by_text('下载或用本机应用打开').wait_for()
        page.evaluate("() => location.hash='/listening'")
        page.get_by_text('2025听力.mp3',exact=True).click()
        page.locator('#pm-audio audio').wait_for()
        assert page.locator('#pm-audio audio').get_attribute('src').startswith('blob:')
        page.get_by_text('2025试卷.pdf',exact=True).click()
        page.locator('#pm-viewer iframe').wait_for()
        assert page.locator('#pm-audio audio').count() == 1
        page.locator('#pm-search').fill('2025')
        assert page.locator('#pm-audio audio').count() == 1
        assert page.locator('#pm-viewer iframe').count() == 1
        assert page.locator('.pm-file').count() >= 2
        print('PASS local library indexes and opens papers, writing and listening without upload', flush=True)
    finally:
        session.close(); browser.close()
