# -*- coding: utf-8 -*-
"""Isolated browser checks for the progressive sentence learning feature.

Run with tools/.cache/venv/Scripts/python.exe tools/verify_sentences.py.
The script starts tools/serve.py on a free port unless BASE_URL is supplied.
Every browser context is temporary; screenshots and logs stay in
tools/.cache/sentence-verification/. No normal browser profile is opened.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import time
import traceback
import urllib.request
from contextlib import contextmanager

from playwright.sync_api import sync_playwright


ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / ".cache" / "sentence-verification"
LOG = OUT / "verify.log"
RESULT = OUT / "result.json"
CHECKS: list[dict] = []
ERRORS: list[str] = []


def log(message):
    text = str(message)
    print(text, flush=True)
    with LOG.open("a", encoding="utf-8") as stream:
        stream.write(text + "\n")


def check(name, actual, expected=True):
    ok = actual == expected
    CHECKS.append({"name": name, "ok": ok, "actual": actual, "expected": expected})
    log(("[OK] " if ok else "[FAIL] ") + name + ("" if ok else f": {actual!r} != {expected!r}"))
    if not ok:
        raise AssertionError(name)


def wait_http(base):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(base + "index.html", timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.15)
    raise RuntimeError("The temporary static server did not become ready")


@contextmanager
def static_server():
    configured = os.environ.get("BASE_URL", "").strip()
    if configured:
        yield configured.rstrip("/") + "/"
        return
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}/"
    with (OUT / "server.log").open("w", encoding="utf-8") as server_log:
        process = subprocess.Popen(
            [sys.executable, str(ROOT / "tools" / "serve.py"), "-p", str(port)],
            cwd=str(ROOT), stdout=server_log, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        try:
            wait_http(base)
            yield base
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def browser_options():
    override = os.environ.get("PLAYWRIGHT_EXECUTABLE_PATH")
    if override:
        return {"executable_path": override}
    cache = ROOT / "tools" / ".cache" / "ms-playwright"
    candidates = sorted(cache.glob("chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe"))
    if candidates:
        return {"executable_path": str(candidates[-1])}
    return {}


class Session:
    def __init__(self, browser, base, mobile=False):
        self.base = base
        self.context = browser.new_context(
            viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 1000},
            device_scale_factor=1, is_mobile=mobile, has_touch=mobile,
            accept_downloads=True,
        )
        self.page = self.context.new_page()
        pg.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}");  # 登录门对测试放行
        self.page.set_default_timeout(6000)
        self.page.on("pageerror", lambda error: ERRORS.append("pageerror: " + str(error)))
        self.page.on("console", lambda message: ERRORS.append("console: " + message.text) if message.type == "error" else None)
        self.page.on("dialog", lambda dialog: dialog.accept())
        self.goto("#/")
        self.page.wait_for_function("() => window.TW && TW.store && TW.app")
        self.page.evaluate("""() => {
            TW.store.setSetting('autoPronounce', false);
            TW.store.setSetting('keySound', false);
            TW.store.setSetting('speakMode', 'tts');
            if (TW.sentences) TW.sentences.setSetting('autoSpeak', false);
            window.__sentenceSpeech = [];
            TW.speech.speak = function (text) {
                window.__sentenceSpeech.push(String(text));
                return Promise.resolve();
            };
        }""")

    def close(self):
        self.context.close()

    def goto(self, route):
        self.page.goto(self.base + route, wait_until="domcontentloaded")
        self.page.wait_for_timeout(100)

    def shot(self, name):
        self.page.screenshot(path=str(OUT / (name + ".png")), full_page=True)

    def no_overflow(self):
        return self.page.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1")

    def courses(self):
        self.goto("#/sentences")
        self.page.locator('[data-sentence-tab="courses"]').wait_for()

    def tab(self, name):
        self.page.locator(f'[data-sentence-tab="{name}"]').click()
        self.page.locator(f'[data-sentence-tab="{name}"][aria-pressed="true"]').wait_for()

    def start(self, course_id=None):
        selector = '[data-start]' if course_id is None else f'[data-start="{course_id}"]'
        self.page.locator(selector).first.click()
        self.page.locator("#sentence-practice").wait_for()

    def submit(self, text):
        self.page.locator("#sentence-input").fill(text)
        self.page.locator("#sentence-submit").click()

    def next(self):
        self.page.locator("#sentence-next").click()

    def state(self):
        return self.page.evaluate("() => TW.sentences.exportState()")

    def current(self):
        return self.page.evaluate("""() => {
            const session = TW.sentences.getSession();
            const unit = TW.sentences.unit(session.ids[session.index]);
            const step = session.mode === 'build' ? session.step : unit.steps.length - 1;
            return {session, unit, answer: unit.steps[step].en, prompt: unit.steps[step].zh};
        }""")

    def progress(self, unit_id):
        return self.page.evaluate("id => TW.sentences.progress(id)", unit_id)

    def course_count(self):
        return self.page.evaluate("() => TW.sentences.courses().length")

    def import_preview(self, text, title="Browser verification course", filename=None):
        self.courses()
        self.tab("import")
        self.page.locator("#sentence-import-title").fill(title)
        if filename:
            self.page.locator("#sentence-import-file").set_input_files({
                "name": filename, "mimeType": "application/json" if filename.endswith(".json") else "text/plain",
                "buffer": text.encode("utf-8"),
            })
            # FileReader's UTF-8 decoder legitimately removes an optional BOM.
            self.page.wait_for_function("text => document.querySelector('#sentence-import-text').value.replace(/^\\uFEFF/, '') === text", arg=text.lstrip("\ufeff"))
        else:
            self.page.locator("#sentence-import-text").fill(text)
        self.page.locator("#sentence-import-preview").click()
        self.page.locator("#sentence-import-result").wait_for()


def run_case(browser, base, name, action, mobile=False):
    session = None
    try:
        log("\n" + name)
        session = Session(browser, base, mobile=mobile)
        action(session)
        session.shot(name)
    except Exception as error:
        if not isinstance(error, AssertionError):
            CHECKS.append({"name": name, "ok": False, "actual": str(error), "expected": "scenario completes"})
        log(traceback.format_exc())
        if session:
            session.shot(name + "-failure")
    finally:
        if session:
            session.close()


def catalogue(session):
    session.courses()
    courses = session.page.evaluate("() => window.TW_SENTENCE_COURSES")
    check("Six original courses are loaded", len(courses), 6)
    check("Every course contains eight units", all(len(course["units"]) == 8 for course in courses))
    check("Every unit has three progressive stages", all(len(unit["steps"]) == 3 for course in courses for unit in course["units"]))
    ids = [unit["id"] for course in courses for unit in course["units"]]
    check("Built-in unit IDs are unique", len(ids), len(set(ids)))
    check("Each stage has an English answer and Chinese prompt", all(
        isinstance(step.get("en"), str) and step["en"].strip() and isinstance(step.get("zh"), str) and step["zh"].strip()
        for course in courses for unit in course["units"] for step in unit["steps"]
    ))
    check("All built-in courses can be started", session.page.locator("[data-start]").count(), 6)
    check("Course catalogue fits desktop viewport", session.no_overflow())


def mobile_layout(session):
    session.courses()
    check("Mobile course catalogue has no horizontal overflow", session.no_overflow())
    session.shot("mobile-courses")
    session.start()
    check("Mobile practice has no horizontal overflow", session.no_overflow())
    check("Mobile submit is visible", session.page.locator("#sentence-submit").is_visible())
    check("Mobile answer hint is visible", session.page.locator("#sentence-hint").is_visible())
    check("Mobile audio button is visible", session.page.locator("#sentence-speak").is_visible())
    session.page.locator("#sentence-input").fill("mobile typing")
    check("Mobile keyboard input accepts spaces", session.page.locator("#sentence-input").input_value(), "mobile typing")
    session.shot("mobile-practice")


def progressive_and_wrong(session):
    session.courses()
    word_before = session.page.evaluate("() => JSON.stringify({progress: TW.store.state.progress, daily: TW.store.state.daily, srs: TW.store.state.srs})")
    session.start()
    current = session.current()
    unit_id = current["unit"]["id"]
    check("Progressive practice begins with its first short phrase", current["session"]["step"], 0)
    check("Chinese practice hides the target answer", session.page.locator("#sentence-target").is_hidden())
    session.submit("")
    check("Empty submission does not advance", session.current()["session"]["step"], 0)
    wrong = current["answer"] + " unexpected"
    session.submit(wrong)
    check("Wrong answer remains on the same stage", session.current()["session"]["step"], 0)
    check("Wrong answer preserves editable text", session.page.locator("#sentence-input").input_value(), wrong)
    check("Wrong words are highlighted", session.page.locator("#sentence-words .bad").count() > 0)
    check("Wrong answer does not create a next-stage button", session.page.locator("#sentence-next").count(), 0)
    check("A unit is not counted after its first partial stage", session.progress(unit_id)["seen"], 0)
    session.shot("progressive-wrong-word")
    for step_index in range(len(current["unit"]["steps"])):
        stage = session.current()
        check("Progressive stage matches curriculum " + str(step_index + 1), stage["session"]["step"], step_index)
        formatted = "  " + stage["answer"].upper().replace(" ", "   ") + "  "
        session.submit(formatted)
        session.page.locator("#sentence-next").wait_for()
        check("Stage " + str(step_index + 1) + " accepts harmless case and whitespace", session.current()["session"]["phase"], "correct")
        if step_index < len(current["unit"]["steps"]) - 1:
            check("Partial stages do not count as completed units", session.progress(unit_id)["seen"], 0)
            session.next()
    progress = session.progress(unit_id)
    check("Completed multi-stage unit is counted once", progress["seen"], 1)
    check("An earlier mistake keeps the unit in the wrong-sentence queue", progress["wrong"], 1)
    check("An earlier mistake cannot receive an independent-correct score", progress["right"], 0)
    check("Wrong unit is due today", unit_id in session.page.evaluate("() => TW.sentences.reviewList('due').map(u => u.id)"))
    session.page.locator("#sentence-favorite").click()
    check("Favorite button persists the current unit", session.progress(unit_id)["favorite"])
    session.next()
    check("Finishing a unit moves to the next unit", session.current()["session"]["index"], 1)
    check("Sentence practice leaves word records unchanged", session.page.evaluate("() => JSON.stringify({progress: TW.store.state.progress, daily: TW.store.state.daily, srs: TW.store.state.srs})"), word_before)
    session.page.locator("#sentence-exit").click()
    session.tab("favorites")
    check("Favorite appears in the favorites view", session.page.locator('[data-unit="' + unit_id + '"]').count(), 1)
    session.tab("review")
    check("Mistake appears in today's sentence review view", session.page.locator('[data-unit="' + unit_id + '"]').count(), 1)
    session.page.locator('[data-unit="' + unit_id + '"]').click()
    session.page.locator('[data-sentence-mode="recall"]').click()
    session.submit(session.current()["answer"])
    after_review = session.progress(unit_id)
    check("Independent review adds a correct result", after_review["right"], 1)
    check("Independent review advances the interval", after_review["bucket"], 1)
    check("Independent review clears the pending wrong status", after_review["needsPractice"], False)
    check("Independent review moves the due date to tomorrow", after_review["due"], session.page.evaluate("() => TW.store.addDays(TW.store.today(), 1)"))
    check("Reviewed unit no longer appears in today's due queue", unit_id in session.page.evaluate("() => TW.sentences.reviewList('due').map(u => u.id)"), False)


def modes_hints_and_deduplication(session):
    session.courses()
    session.start()
    original = session.current()
    unit_id = original["unit"]["id"]
    session.submit(original["answer"])
    session.next()
    check("Build mode reaches the second short stage", session.current()["session"]["step"], 1)
    session.page.locator("#sentence-input").fill("unfinished draft")
    session.page.locator('[data-sentence-mode="recall"]').click()
    recall = session.current()
    check("Switching to full translation keeps the same unit", recall["unit"]["id"], unit_id)
    check("Switching modes resets the typing draft", session.page.locator("#sentence-input").input_value(), "")
    check("Translation mode asks for the full sentence", recall["answer"], original["unit"]["steps"][-1]["en"])
    session.submit(recall["answer"])
    check("Independent translation is scored correctly", session.progress(unit_id)["right"], 1)
    completed_progress = session.progress(unit_id)
    session.page.locator('[data-sentence-mode="listen"]').click()
    check("Listening mode keeps the same unit", session.current()["unit"]["id"], unit_id)
    check("Listening mode hides the target English", session.page.locator("#sentence-target").is_hidden())
    check("Listening mode starts pronunciation", session.page.evaluate("() => __sentenceSpeech.length > 0"))
    before_speak = session.page.evaluate("() => __sentenceSpeech.length")
    session.page.locator("#sentence-speak").click()
    check("Replay button speaks the current full sentence", session.page.evaluate("() => __sentenceSpeech.length"), before_speak + 1)
    session.submit(session.current()["answer"])
    check("Repeating a completed unit in a different mode does not double count", session.progress(unit_id), completed_progress)
    session.page.locator("#sentence-retry").click()
    session.submit(session.current()["answer"])
    check("Same-sentence retry does not double count a session attempt", session.progress(unit_id), completed_progress)
    session.next()
    hinted_id = session.current()["unit"]["id"]
    session.page.locator('[data-sentence-mode="recall"]').click()
    session.page.locator("#sentence-hint").click()
    check("Hint reveals the current target", session.page.locator("#sentence-target").is_visible())
    check("Showing a hint does not prematurely record an attempt", session.progress(hinted_id)["seen"], 0)
    session.submit(session.current()["answer"])
    hinted = session.progress(hinted_id)
    check("Assisted completion is counted as needing practice", hinted["wrong"], 1)
    check("Assisted completion is not independent mastery", hinted["right"], 0)
    check("Hint cannot extend the review interval", hinted["bucket"], 0)
    check("Hinted unit enters today's review queue", hinted_id in session.page.evaluate("() => TW.sentences.reviewList('due').map(u => u.id)"))


def resume_and_keyboard(session):
    session.courses()
    session.start()
    initial = session.current()
    session.page.locator("#sentence-input").fill(initial["answer"])
    session.page.locator("#sentence-input").press("Enter")
    check("Enter submits a sentence", session.current()["session"]["phase"], "correct")
    session.page.locator("#sentence-input").press("Enter")
    check("Enter on correct feedback advances one stage", session.current()["session"]["step"], 1)
    draft = "A persistent typing draft"
    session.page.locator("#sentence-input").fill(draft)
    before = session.current()["session"]
    session.goto("#/books")
    session.goto("#/sentences?run=1")
    session.page.locator("#sentence-practice").wait_for()
    check("Route changes preserve typed input", session.page.locator("#sentence-input").input_value(), draft)
    check("Route changes preserve the session ID", session.current()["session"]["id"], before["id"])
    session.page.reload(wait_until="domcontentloaded")
    session.page.locator("#sentence-practice").wait_for()
    restored = session.current()["session"]
    check("Reload preserves the unit index", restored["index"], before["index"])
    check("Reload preserves the progressive stage", restored["step"], before["step"])
    check("Reload preserves typed input", session.page.locator("#sentence-input").input_value(), draft)
    session.page.locator("#sentence-input").evaluate("""input => {
        input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true}));
        input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,isComposing:true}));
    }""")
    check("IME confirmation Enter does not submit or advance", session.current()["session"]["phase"], "typing")
    session.page.locator("#sentence-input").evaluate("input => input.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true}))")
    session.page.locator("#sentence-input").press("Escape")
    session.page.locator("#sentence-page").wait_for()
    check("Escape returns to the course library", session.page.locator("#sentence-practice").count(), 0)
    session.page.locator("#sentence-quick-start").click()
    check("Continue button restores the suspended draft", session.page.locator("#sentence-input").input_value(), draft)


def completion(session):
    session.courses()
    session.start()
    session.page.locator('[data-sentence-mode="recall"]').click()
    started = session.current()["session"]
    for index, unit_id in enumerate(started["ids"]):
        check("Course completion visits unit " + str(index + 1), session.current()["unit"]["id"], unit_id)
        session.submit(session.current()["answer"])
        session.next()
    session.page.locator("#sentence-complete").wait_for()
    saved = session.page.evaluate("() => TW.sentences.getSession()")
    check("Completed course session is marked complete", saved["completed"])
    check("Completion counts each unit exactly once", saved["answered"], len(started["ids"]))
    check("Clean course completion counts independent correct units", saved["correct"], len(started["ids"]))
    check("Every completed unit has one result", all(session.progress(unit_id)["seen"] == 1 for unit_id in started["ids"]))
    session.shot("course-complete")
    session.page.locator("#sentence-next-group").click()
    check("Completed course can be started for another round", session.page.locator("#sentence-practice").is_visible())
    check("A new round receives a fresh attempt ID", session.current()["session"]["id"] != started["id"])


def backup_restore(session):
    session.courses()
    session.start()
    session.page.locator('[data-sentence-mode="recall"]').click()
    unit_id = session.current()["unit"]["id"]
    session.page.locator("#sentence-favorite").click()
    session.submit(session.current()["answer"])
    session.page.locator("#sentence-exit").click()
    session.import_preview("I keep my own learning material. | 我保留自己的学习资料。", "Backup custom course")
    session.page.locator("#sentence-import-confirm").click()
    expected = session.state()
    custom_id = expected["courses"][-1]["id"]
    session.goto("#/settings")
    with session.page.expect_download() as download_event:
        session.page.locator("#data-export").click()
    backup_path = OUT / "browser-backup.json"
    download_event.value.save_as(str(backup_path))
    backup = json.loads(backup_path.read_text(encoding="utf-8"))
    check("Site backup includes all sentence data", backup.get("sentences"), expected)
    session.page.evaluate("id => { TW.sentences.resetProgress(); TW.sentences.deleteCourse(id); }", custom_id)
    check("Restore fixture actually differs from the saved backup", session.state() != expected)
    session.page.locator("#data-file").set_input_files(str(backup_path))
    session.page.wait_for_function("id => TW.sentences.course(id) !== null", arg=custom_id)
    check("Settings-page import restores sentence progress, courses and session", session.state(), expected)
    check("Restored sentence favorite survives", session.progress(unit_id)["favorite"])
    session.page.reload(wait_until="domcontentloaded")
    session.page.locator("#data-export").wait_for()
    check("Restored sentence data survives page reload", session.state(), expected)
    bad_backup = dict(backup)
    bad_backup["sentences"] = dict(expected, version=999)
    session.page.locator("#data-file").set_input_files({
        "name": "invalid-sentence-backup.json", "mimeType": "application/json",
        "buffer": json.dumps(bad_backup, ensure_ascii=False).encode("utf-8"),
    })
    session.page.wait_for_timeout(150)
    check("Malformed whole-site backup preserves sentence data", session.state(), expected)


def imports_and_safety(session):
    session.courses()
    initial_count = session.course_count()
    examples = [
        ("text", "I enjoy quiet mornings. | 我喜欢安静的早晨。\nWe learn something new every day. | 我们每天学点新东西。", None, 2),
        ("json", json.dumps({"title": "JSON practice", "units": [{"title": "Greeting", "steps": [
            {"en": "my old friend", "zh": "我的老朋友"}, {"en": "I met my old friend today.", "zh": "我今天见到老朋友了。"}
        ]}]}, ensure_ascii=False), "practice.json", 1),
        ("csv", 'en,zh\n"Hello, my friend.","你好，我的朋友。"\n"I can read this, too.","我也能读这个。"', "practice.csv", 2),
    ]
    for label, text, filename, unit_count in examples:
        before = session.course_count()
        session.import_preview(text, title="E2E " + label, filename=filename)
        check(label + " preview does not save a course", session.course_count(), before)
        check(label + " preview contains parsed English", "friend" in session.page.locator("#sentence-import-result").inner_text() if label != "text" else "quiet mornings" in session.page.locator("#sentence-import-result").inner_text())
        session.page.locator("#sentence-import-confirm").click()
        check(label + " confirmation saves one course", session.course_count(), before + 1)
        saved = session.state()["courses"][-1]
        check(label + " import preserves unit count", len(saved["units"]), unit_count)
        if label == "json":
            check("JSON preserves progressive stages", len(saved["units"][0]["steps"]), 2)
        if label == "csv":
            check("CSV quoted comma remains in the sentence", saved["units"][0]["steps"][0]["en"], "Hello, my friend.")

    before_bad = session.state()
    session.import_preview('{"units":[}', filename="broken.json")
    check("Malformed file does not alter existing sentence data", session.state(), before_bad)
    confirm = session.page.locator("#sentence-import-confirm")
    check("Malformed preview cannot be confirmed", confirm.count() == 0 or confirm.is_disabled())

    poisoned = '{"title":"unsafe","__proto__":{"polluted":true},"units":[{"en":"A safe sentence.","zh":"一个安全句子。"}]}'
    session.import_preview(poisoned, filename="unsafe.json")
    check("Unsafe JSON does not alter saved data", session.state(), before_bad)
    check("Unsafe JSON cannot pollute object prototypes", session.page.evaluate("() => ({}).polluted === undefined"))

    payload = '<img src="x" onerror="window.__sentenceXss=1">'
    unsafe_text = json.dumps({"title": payload, "units": [{"title": payload, "steps": [{"en": "I read safe text.", "zh": payload}]}]})
    session.import_preview(unsafe_text, title=payload)
    check("Import preview renders markup as plain text", session.page.locator('#sentence-import-result img[src="x"]').count(), 0)
    session.page.locator("#sentence-import-confirm").click()
    unsafe_course = session.state()["courses"][-1]
    session.courses()
    check("Imported title does not create executable markup", session.page.locator('img[src="x"]').count(), 0)
    check("Imported markup did not execute", session.page.evaluate("() => window.__sentenceXss || 0"), 0)
    session.start(unsafe_course["id"])
    check("Imported prompt does not create executable markup", session.page.locator('img[src="x"]').count(), 0)
    check("Imported prompt did not execute", session.page.evaluate("() => window.__sentenceXss || 0"), 0)
    session.page.locator("#sentence-exit").click()
    session.courses()
    session.page.locator('[data-delete-course="' + unsafe_course["id"] + '"]').click()
    check("Custom course can be deleted through its UI", session.course_count(), initial_count + len(examples))


def invalid_backups(session):
    session.courses()
    first_unit = session.page.evaluate("() => TW.sentences.units()[0].id")
    session.page.evaluate("id => TW.sentences.toggleFavorite(id)", first_unit)
    before = session.state()
    for mutation in [
        {"version": 999},
        {"progress": {first_unit: {"seen": 1, "right": 5, "wrong": 0}}},
        {"settings": {"mode": "invalid"}},
        {"daily": {"2026-02-31": {"done": 1, "right": 1}}},
    ]:
        bad = dict(before)
        bad.update(mutation)
        rejected = session.page.evaluate("""value => {
            try { TW.sentences.importState(value); return false; }
            catch (error) { return !!error.message; }
        }""", bad)
        check("Invalid backup is rejected: " + next(iter(mutation)), rejected)
        check("Rejected backup preserves existing state: " + next(iter(mutation)), session.state(), before)


def pool_batches(session, kind):
    session.courses()
    pool_ids = session.page.evaluate("""kind => {
        TW.sentences.setSetting('size', 4);
        TW.sentences.setSetting('mode', 'recall');
        TW.sentences.setSetting('order', 'seq');
        const ids = TW.sentences.units().slice(0, 9).map(unit => unit.id);
        ids.forEach(id => {
            if (kind === 'favorite') TW.sentences.toggleFavorite(id);
            else TW.sentences.recordResult(id, true, {attemptId: 'e2e-seed:' + id});
        });
        return ids;
    }""", kind)
    session.tab("favorites" if kind == "favorite" else "review")
    if kind == "learned":
        session.page.locator('[data-review-filter="learned"]').click()
        session.page.locator('[data-review-filter="learned"].active').wait_for()
    check(kind + " fixture contains more than two batches", session.page.locator("[data-unit]").count(), 9)
    session.page.locator("#sentence-review-start").click()
    covered = []
    batch_sizes = []
    while len(covered) < len(pool_ids):
        current = session.current()["session"]
        batch = current["ids"]
        check(kind + " next batch contains only pool members", set(batch).issubset(pool_ids))
        check(kind + " next batch never repeats an already-covered ID", bool(set(batch).intersection(covered)), False)
        check(kind + " batch has at most configured size", 0 < len(batch) <= 4)
        batch_sizes.append(len(batch))
        for unit_id in batch:
            check(kind + " batch follows its saved unit sequence", session.current()["unit"]["id"], unit_id)
            session.submit(session.current()["answer"])
            session.next()
        covered.extend(batch)
        session.page.locator("#sentence-complete").wait_for()
        if len(covered) < len(pool_ids):
            session.page.locator("#sentence-next-group").click()
            if len(batch_sizes) == 1:
                pending_ids = session.current()["session"]["ids"]
                session.page.reload(wait_until="domcontentloaded")
                session.page.locator("#sentence-practice").wait_for()
                check(kind + " batch coverage survives session reload", session.current()["session"]["ids"], pending_ids)
    check(kind + " consecutive batches cover the complete nine-unit pool", sorted(covered), sorted(pool_ids))
    check(kind + " pagination uses all three batches without recycling the first", batch_sizes, [4, 4, 1])


def english_only_assistance(session):
    sentence = "I can learn from my own notes."
    session.import_preview(sentence, "English-only follow typing")
    session.page.locator("#sentence-import-confirm").click()
    course = session.state()["courses"][-1]
    unit_id = course["units"][0]["id"]
    session.page.evaluate("""id => {
        TW.sentences.setSetting('mode', 'recall');
        TW.sentences.enroll(id);
    }""", unit_id)
    session.start(course["id"])
    check("English-only material visibly provides its English answer", session.page.locator("#sentence-target").is_visible())
    check("English-only material is marked as assisted before typing", session.current()["session"]["hints"].get(unit_id, False))
    session.submit(sentence)
    progress = session.progress(unit_id)
    check("English-only follow typing does not earn an independent correct result", progress["right"], 0)
    check("English-only follow typing records an assisted practice result", progress["wrong"], 1)
    check("English-only follow typing does not promote its SRS interval", progress["bucket"], 0)
    check("English-only follow typing remains due today", unit_id in session.page.evaluate("() => TW.sentences.reviewList('due').map(unit => unit.id)"))
    session.next()
    check("English-only completion summary has no independent correct count", session.page.evaluate("() => TW.sentences.getSession().correct"), 0)


def subtitle_imports(session):
    samples = [
        ("lesson.srt", "\ufeff1\n00:00:01,000 --> 00:00:03,000\nHello, my friend.\n你好，我的朋友。\n\n2\n00:00:04,000 --> 00:00:06,000\nWe can learn together.\n我们可以一起学习。\n", ["Hello, my friend.", "We can learn together."]),
        ("lesson.vtt", "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nI read a little every day.\n我每天读一点。\n\n00:00:04.000 --> 00:00:06.000\nPractice makes it easier.\n练习让它更容易。\n", ["I read a little every day.", "Practice makes it easier."]),
    ]
    imported_ids = []
    for filename, text, expected in samples:
        before = session.course_count()
        session.import_preview(text, "Subtitle " + filename, filename=filename)
        preview = session.page.locator("#sentence-import-result").inner_text()
        check(filename + " preview contains actual speech", expected[0] in preview)
        check(filename + " preview omits timecodes", "00:00:" in preview, False)
        check(filename + " preview does not modify saved courses", session.course_count(), before)
        session.page.locator("#sentence-import-confirm").click()
        course = session.state()["courses"][-1]
        imported_ids.append(course["id"])
        check(filename + " confirmation imports exactly two cues", len(course["units"]), 2)
        check(filename + " imports clean English without cue IDs or headers", [unit["steps"][0]["en"] for unit in course["units"]], expected)
        check(filename + " preserves bilingual Chinese lines", all(unit["steps"][0]["zh"] for unit in course["units"]))
    session.start(imported_ids[0])
    draft = "My subtitle practice draft"
    session.page.locator("#sentence-input").fill(draft)
    before_reload = session.current()["session"]
    session.page.reload(wait_until="domcontentloaded")
    session.page.locator("#sentence-practice").wait_for()
    check("Imported subtitle course session remains valid after reload", session.current()["session"]["id"], before_reload["id"])
    check("Imported subtitle typing draft survives reload", session.page.locator("#sentence-input").input_value(), draft)
    check("Both imported subtitle courses survive reload", session.page.evaluate("ids => ids.every(id => TW.sentences.course(id) !== null)", imported_ids))


def interrupted_difficulty_and_alternatives(session):
    session.courses()
    course_ids = session.page.evaluate("() => TW.sentences.courses().map(course => course.id)")
    session.start(course_ids[0])
    wrong_id = session.current()["unit"]["id"]
    session.submit("this answer contains the wrong words")
    check("An unfinished wrong stage does not add a completed attempt", session.progress(wrong_id)["seen"], 0)
    session.page.locator("#sentence-input").press("Escape")
    session.page.locator("#sentence-page").wait_for()
    session.start(course_ids[1])
    check("Changing course after an error preserves the wrong-unit queue", wrong_id in session.page.evaluate("() => TW.sentences.reviewList('wrong').map(unit => unit.id)"))
    check("Changing course after an error preserves today's review", wrong_id in session.page.evaluate("() => TW.sentences.reviewList('due').map(unit => unit.id)"))
    hinted_id = session.current()["unit"]["id"]
    session.page.locator("#sentence-hint").click()
    session.page.locator("#sentence-input").press("Escape")
    session.page.locator("#sentence-page").wait_for()
    session.start(course_ids[2])
    check("An interrupted hinted stage does not add a completed attempt", session.progress(hinted_id)["seen"], 0)
    check("Changing course after a hint preserves the wrong-unit queue", hinted_id in session.page.evaluate("() => TW.sentences.reviewList('wrong').map(unit => unit.id)"))
    check("Changing course after a hint preserves today's review", hinted_id in session.page.evaluate("() => TW.sentences.reviewList('due').map(unit => unit.id)"))
    session.page.locator("#sentence-exit").click()
    candidate = session.page.evaluate("() => TW.sentences.units().find(unit => (unit.steps[unit.steps.length - 1].alternatives || []).length)")
    row = session.page.locator('[data-unit="' + candidate["id"] + '"]')
    row.locator("xpath=ancestor::details/summary").click()
    row.click()
    session.page.locator('[data-sentence-mode="recall"]').click()
    alternative = candidate["steps"][-1]["alternatives"][0]
    session.submit(alternative)
    check("A declared equivalent answer is accepted", session.current()["session"]["phase"], "correct")
    check("An accepted equivalent answer has no red wrong-word markers", session.page.locator("#sentence-words .bad").count(), 0)
    check("An independent equivalent answer earns the correct result", session.progress(candidate["id"])["right"], 1)




def main():
    OUT.mkdir(parents=True, exist_ok=True)
    LOG.write_text("", encoding="utf-8")
    with static_server() as base, sync_playwright() as playwright:
        log("Temporary site: " + base)
        browser = playwright.chromium.launch(**browser_options())
        try:
            scenarios = [
                ("01-catalogue", catalogue, False),
                ("02-progressive-wrong-review", progressive_and_wrong, False),
                ("03-modes-hints-dedup", modes_hints_and_deduplication, False),
                ("04-resume-keyboard", resume_and_keyboard, False),
                ("05-import-safety", imports_and_safety, False),
                ("06-completion", completion, False),
                ("07-invalid-backups", invalid_backups, False),
                ("08-backup-restore", backup_restore, False),
                ("09-mobile", mobile_layout, True),
                ("10-favorite-batches", lambda session: pool_batches(session, "favorite"), False),
                ("11-learned-batches", lambda session: pool_batches(session, "learned"), False),
                ("12-english-only-assisted", english_only_assistance, False),
                ("13-subtitle-import-reload", subtitle_imports, False),
                ("14-interrupted-difficulty-alternatives", interrupted_difficulty_and_alternatives, False),
            ]
            for name, action, mobile in scenarios:
                run_case(browser, base, name, action, mobile=mobile)
        finally:
            browser.close()
    CHECKS.append({"name": "No console errors or uncaught exceptions", "ok": not ERRORS, "actual": ERRORS, "expected": []})
    RESULT.write_text(json.dumps({"checks": CHECKS, "browserErrors": ERRORS}, ensure_ascii=False, indent=2), encoding="utf-8")
    failures = sum(not item["ok"] for item in CHECKS)
    log(f"\n{len(CHECKS) - failures}/{len(CHECKS)} checks passed; {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
