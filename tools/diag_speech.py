# -*- coding: utf-8 -*-
"""诊断「朗读没声音」：在真实 Chromium 里检查 speechSynthesis 语音包与 speak 是否真的触发。
用法（必须在沙箱外跑，Chromium 才能起）：
    NODE_OPTIONS= python tools/diag_speech.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8777

CHROMIUM_CANDIDATES = [
    # 与 verify_site.py 保持一致：playwright 1.63 对应 chromium_headless_shell-1243
    Path.home() / "AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe",
    Path.home() / "AppData/Local/ms-playwright/chromium-1243/chrome-win/chrome.exe",
]


def find_chromium():
    for p in CHROMIUM_CANDIDATES:
        if p.exists():
            return p
    return None


def main():
    from playwright.sync_api import sync_playwright

    exe = find_chromium()
    print("chromium:", exe)

    # 起本地服务
    srv = subprocess.Popen(
        [sys.executable, str(ROOT / "tools/serve.py"), "--port", str(PORT)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    try:
        with sync_playwright() as pw:
            kwargs = {"args": ["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"]}
            if exe:
                kwargs["executable_path"] = str(exe)
            browser = pw.chromium.launch(**kwargs)
            ctx = browser.new_context()
            page = ctx.new_page()
            page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
            page.wait_for_timeout(600)

            info = page.evaluate("""() => {
              const r = {ua: navigator.userAgent, hasSS: typeof speechSynthesis !== 'undefined'};
              if (!r.hasSS) return r;
              const vs = speechSynthesis.getVoices();
              r.voiceCount = vs.length;
              r.voices = vs.slice(0, 12).map(v => v.lang + ' | ' + v.name);
              r.enVoices = vs.filter(v => /^en/i.test(v.lang)).length;
              return r;
            }""")
            print(json.dumps(info, ensure_ascii=False, indent=2))

            # 尝试真正 speak，看事件触发
            probe = page.evaluate("""() => new Promise(res => {
              const log = {started:false, ended:false, error:null, voicesAtCall:0};
              if (typeof speechSynthesis === 'undefined') { log.error='no speechSynthesis'; return res(log); }
              try {
                log.voicesAtCall = speechSynthesis.getVoices().length;
                speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance('hello');
                u.lang = 'en-US';
                u.onstart = () => { log.started = true; };
                u.onend = () => { log.ended = true; };
                u.onerror = (e) => { log.error = e.error || 'unknown'; };
                speechSynthesis.speak(u);
              } catch (e) { log.error = String(e); }
              setTimeout(() => res(log), 2500);
            })""")
            print("speak 探针:", json.dumps(probe, ensure_ascii=False))

            # 音频直链能否加载
            audio = page.evaluate("""() => new Promise(res => {
              const a = new Audio('https://dict.youdao.com/dictvoice?audio=hello&type=2');
              a.oncanplaythrough = () => res({ok:true, dur:a.duration});
              a.onerror = () => res({ok:false, err:'audio error'});
              setTimeout(() => res({ok:false, err:'timeout', rs:a.readyState}), 4000);
              a.load();
            })""")
            print("有道音频探针:", json.dumps(audio, ensure_ascii=False))

            browser.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
