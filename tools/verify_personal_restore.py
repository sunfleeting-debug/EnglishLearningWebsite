from verify_sentences import Session, static_server, browser_options, OUT
from playwright.sync_api import sync_playwright

OUT.mkdir(parents=True, exist_ok=True)
with static_server() as base, sync_playwright() as p:
    browser=p.chromium.launch(**browser_options()); session=Session(browser,base); page=session.page
    try:
        page.evaluate("""async () => {
          const root=await navigator.storage.getDirectory();
          const folder=await root.getDirectoryHandle('test-materials',{create:true});
          const handle=await folder.getFileHandle('六级真题试卷.pdf',{create:true});
          const writer=await handle.createWritable(); await writer.write('test pdf'); await writer.close();
          window.showDirectoryPicker=async()=>folder;
          location.hash='/quiz';
        }""")
        page.locator('#pm-choose').wait_for(); page.locator('#pm-choose').click()
        page.locator('.pm-file b').filter(has_text='六级真题试卷.pdf').wait_for(timeout=10000)
        page.reload(wait_until='domcontentloaded')
        page.locator('.pm-file b').filter(has_text='六级真题试卷.pdf').wait_for(timeout=10000)
        print('PASS real directory handle is restored after reload',flush=True)
    finally:
        session.close(); browser.close()
