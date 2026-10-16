# -*- coding: utf-8 -*-
"""核验「发音双通道」：在线真人音频优先 → 失败自动回退系统语音。
用法（Chromium 需在沙箱外起）：
    python tools/verify_speech.py
"""
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8788

FAILS = []


def check(name, cond, extra=""):
    print(("  [OK]  " if cond else "  [FAIL]") + " " + name + (("   -> " + str(extra)) if extra else ""))
    if not cond:
        FAILS.append(name)


# 在页面脚本执行前挂钩 speechSynthesis.speak，统计 TTS 调用次数
HOOK_TTS = """
window.__ttsCalls = 0;
window.__ttsHooked = false;
try {
  var ss = window.speechSynthesis;
  if (ss) {
    var orig = ss.speak;
    ss.speak = function (u) { window.__ttsCalls++; return orig.call(ss, u); };
    window.__ttsHooked = (ss.speak !== orig);
  }
} catch (e) { window.__ttsHooked = 'err:' + e; }
"""


def main():
    from playwright.sync_api import sync_playwright

    srv = subprocess.Popen(
        [sys.executable, str(ROOT / "tools/serve.py"), "--port", str(PORT)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"]
            )

            # ---------- 场景 1：正常联网，应走在线音频 ----------
            print("\n[场景 1] 正常联网 -> 在线音频")
            ctx = browser.new_context()
            ctx.add_init_script(HOOK_TTS)
            ctx.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
            page = ctx.new_page()
            audio_reqs = []
            errors = []
            page.on("request", lambda r: audio_reqs.append(r.url) if "dictvoice" in r.url else None)
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto("http://127.0.0.1:%d/index.html#/settings" % PORT, wait_until="load")
            page.wait_for_timeout(800)

            vals = page.eval_on_selector_all("#set-speakmode button", "els => els.map(e => e.dataset.val)")
            check("设置页存在「发音方式」三选项", vals == ["auto", "audio", "tts"], vals)
            check("默认发音方式为 auto", page.evaluate("TW.store.settings.speakMode") == "auto")
            check("TTS 挂钩成功（可统计回退）", page.evaluate("window.__ttsHooked") is True,
                  page.evaluate("window.__ttsHooked"))

            page.click("#set-speakmode button[data-val='audio']")
            page.wait_for_timeout(400)
            check("可切换到「在线音频」", page.evaluate("TW.store.settings.speakMode") == "audio")
            saved = page.evaluate("(JSON.parse(localStorage.getItem('typingcet.state.v1')||'{}').settings)||{}")
            check("设置已写入 localStorage", saved.get("speakMode") == "audio", saved.get("speakMode"))

            audio_reqs.clear()
            page.click("#set-test")               # 试听按钮（真实用户手势）
            page.wait_for_timeout(1500)
            hit = [u for u in audio_reqs if "dictvoice" in u]
            check("发起有道真人音频请求", len(hit) > 0, hit[:1])
            check("请求带正确口音参数 type=2(美音)", any("type=2" in u for u in hit), hit[:1])

            # 重复点击同一词不应重复请求（有缓存）
            n1 = len(hit)
            page.click("#set-test")
            page.wait_for_timeout(900)
            check("重复点击同一词不重复请求（音频已缓存）", len(audio_reqs) == n1, len(audio_reqs))

            check("场景 1 控制台无错误", not errors, errors[:3])
            ctx.close()

            # ---------- 场景 2：断掉音频源，应自动回退系统语音 ----------
            print("\n[场景 2] 在线音频不可用 -> 自动回退系统语音")
            ctx2 = browser.new_context()
            ctx2.add_init_script(HOOK_TTS)
            ctx2.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
            ctx2.route("**/dictvoice*", lambda route: route.abort())
            p2 = ctx2.new_page()
            errs2 = []
            p2.on("pageerror", lambda e: errs2.append(str(e)))
            p2.goto("http://127.0.0.1:%d/index.html" % PORT, wait_until="load")
            p2.wait_for_timeout(600)
            before = p2.evaluate("window.__ttsCalls")
            p2.evaluate("TW.speech.speak('banana','us')")
            p2.wait_for_timeout(2600)             # 等音频超时(2.5s)触发回退
            after = p2.evaluate("window.__ttsCalls")
            check("音频失败后回退到系统语音合成", after > before, "before=%s after=%s" % (before, after))
            check("回退过程无未捕获异常", not errs2, errs2[:3])
            ctx2.close()

            # ---------- 场景 3：只用系统语音模式 ----------
            print("\n[场景 3] 显式选择「系统语音」-> 不发音频请求")
            ctx3 = browser.new_context()
            ctx3.add_init_script(HOOK_TTS)
            ctx3.add_init_script("try{localStorage.setItem('typingcet.guest','1')}catch(e){}")
            p3 = ctx3.new_page()
            reqs3 = []
            p3.on("request", lambda r: reqs3.append(r.url) if "dictvoice" in r.url else None)
            p3.goto("http://127.0.0.1:%d/index.html" % PORT, wait_until="load")
            p3.wait_for_timeout(500)
            p3.evaluate("TW.store.setSetting('speakMode','tts')")
            b2 = p3.evaluate("window.__ttsCalls")
            p3.evaluate("TW.speech.speak('orange','us')")
            p3.wait_for_timeout(700)
            a2 = p3.evaluate("window.__ttsCalls")
            check("tts 模式直接调用系统语音", a2 > b2, "before=%s after=%s" % (b2, a2))
            check("tts 模式不发起音频请求", not reqs3, reqs3[:2])
            ctx3.close()

            try:
                browser.close()
            except Exception:
                # 收尾关闭偶发 driver 断连（沙箱/信号导致），不影响已完成的断言结果，忽略即可
                pass
    finally:
        srv.terminate()

    print("\n" + "=" * 46)
    if FAILS:
        print("失败 %d 项：" % len(FAILS))
        for f in FAILS:
            print("  - " + f)
        sys.exit(1)
    print("全部通过：发音双通道 + 失败回退 均正常")


if __name__ == "__main__":
    main()
