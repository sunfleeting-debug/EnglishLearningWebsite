# -*- coding: utf-8 -*-
"""复刻 verify_site 名句卡用例的调试探针。"""
import pathlib, sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")


def main():
    with sync_playwright() as p:
        pg = p.chromium.launch(executable_path=str(EXE), headless=True).new_page()
        held = []
        pg.route("**/data/dict/*.js", lambda route: held.append(route))
        pg.goto(BASE + "#/", wait_until="domcontentloaded")
        pg.wait_for_timeout(600)
        pg.evaluate("() => navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); })")
        pg.add_init_script("navigator.serviceWorker.register = function () { return new Promise(function () {}); };")
        pg.goto(BASE + "#/", wait_until="domcontentloaded")
        pg.wait_for_timeout(600)
        qw = pg.evaluate("() => { const w = TW.WORDS.find(x => !TW.data.dictLetterReady(x.word));"
                         "  return w ? (w.id + '|' + w.word + '|' + TW.data.dictLetterOf(w.word)) : ''; }")
        print("qw:", qw)
        pg.goto(BASE + "#/word?id=" + qw.split("|")[0], wait_until="domcontentloaded")
        pg.wait_for_timeout(700)
        print("held:", [h.request.url[-25:] for h in held])
        print("controller:", pg.evaluate("() => !!navigator.serviceWorker.controller"))
        lq = pg.evaluate("() => (document.querySelector('.load-quote') || {textContent: ''}).textContent")
        print("quote:", lq[:80])
        print("html:", pg.evaluate("() => (document.getElementById('view')||{innerHTML:''}).innerHTML.slice(0, 220)"))
        for r in held:
            r.fulfill(status=200, content_type="application/javascript", body="/* stub */")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
