# -*- coding: utf-8 -*-
"""写作板块视觉核验：列表 / 做题页 / 批改结果 / 窄屏，各截一张。

用法：
    NODE_OPTIONS= python tools/shot_writing.py
产物在 tools/_shots/（已 gitignore）。
"""
import json
import os
import pathlib
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "_shots"
PORT = int(os.environ.get("PORT", "5197"))
BASE = "http://127.0.0.1:%d/" % PORT
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

GRADE_TEXT = """总评：整体意思到位，两周内能上 12 分，主要卡在搭配和句式变化上。

1. 用词偏口语；
2. 句子几乎全是「主+谓+宾」，缺少分词结构和插入语；
3. 有个别冠词遗漏。

```grade
%s
```
"""

GRADE = {
    "score": 11,
    "max": 15,
    "rubric": [{"name": "准确", "score": 4, "max": 5},
               {"name": "通顺", "score": 4, "max": 5},
               {"name": "用词", "score": 3, "max": 5}],
    "comment": "整体意思到位，个别搭配偏中式，句式也偏单调。",
    "issues": [
        {"quote": "has become increasingly popular among",
         "fix": "has gained growing popularity among",
         "why": "后者更书面，六级作文常用。"},
        {"quote": "a lot of students",
         "fix": "a large number of students",
         "why": "口语化表达，议论文里应避免。"},
    ],
    "rewrite": "With the rapid development of the Internet, online learning has gained growing "
               "popularity among college students in China, and a large number of them now "
               "regard it as part of their daily routine.",
    "samples": [
        {"style": "稳妥版", "text": "Online learning is now popular with many college students in "
                                    "China. It saves time and offers flexible schedules."},
        {"style": "进阶版", "text": "Thanks to the Internet, online learning has won wide acceptance "
                                    "among Chinese college students, who value its flexibility far "
                                    "more than the fixed timetable of a traditional classroom."},
        {"style": "高分版", "text": "The Internet has turned online learning into a routine part of "
                                    "college life in China, a shift that few students could now "
                                    "imagine reversing — and one that has quietly redrawn the "
                                    "boundary between the classroom and the dormitory."},
    ],
}

ANSWER = ("With the rapid development of the internet, online learning has become increasingly "
          "popular among college students in China, and a lot of students now prefer it because "
          "it is flexible and saves them a great deal of time on the way.")

CFG = {"provider": "custom", "keys": {"custom": "sk-test-abcdef123456"},
       "models": {"custom": "agnes-3.0-flash"},
       "baseUrl": "https://example.invalid/v1", "modelLists": {}}


def wait_http(url, timeout=25):
    import urllib.request
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                return r.status
        except Exception:
            time.sleep(0.25)
    return None


def main():
    s = socket.socket(); s.settimeout(0.3)
    busy = s.connect_ex(("127.0.0.1", PORT)) == 0
    s.close()
    if busy:
        print("端口 %d 被占用" % PORT)
        return 3
    OUT.mkdir(parents=True, exist_ok=True)

    procs = [subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=str(ROOT),
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    try:
        if wait_http(BASE + "index.html") != 200:
            print("服务未就绪")
            return 3
        with sync_playwright() as pw:
            kw = {"executable_path": str(EXE)} if EXE.exists() else {}
            browser = pw.chromium.launch(**kw)
            ctx = browser.new_context(viewport={"width": 1280, "height": 1000},
                                      device_scale_factor=1)
            pg = ctx.new_page()
            pg.add_init_script("""
            try{ localStorage.setItem('typingcet.guest','1');
                 localStorage.setItem('typingcet.ai.v1', %s);
                 localStorage.removeItem('typingcet.write.v1'); }catch(e){}
            """ % json.dumps(json.dumps(CFG)))

            text = GRADE_TEXT % json.dumps(GRADE, ensure_ascii=False)
            parts = [text[:60], text[60:200], text[200:400], text[400:]]
            chunks = "".join(
                "data: " + json.dumps({"choices": [{"delta": {"content": p}}]}, ensure_ascii=False) + "\n\n"
                for p in parts if p) + "data: [DONE]\n\n"
            # 路由挂在 context 上：后面还要开新页（窄屏 / 暗色），page 级 route 只管一页
            ctx.route("**/api/ai/chat", lambda r: r.fulfill(
                status=200, content_type="text/event-stream",
                headers={"Access-Control-Allow-Origin": "*"}, body=chunks))

            # 1. 列表
            pg.goto(BASE + "#/writing", wait_until="domcontentloaded")
            pg.wait_for_selector(".wr-card")
            pg.wait_for_timeout(500)
            pg.screenshot(path=str(OUT / "wr-01-list.png"), full_page=True)

            # 2. 做题页（要点展开 + 参考折叠）
            pg.click(".wr-card >> nth=0")
            pg.wait_for_selector("#wr-input")
            pg.wait_for_timeout(300)
            pg.click("#wr-tips")
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / "wr-02-item.png"), full_page=True)

            # 3. 批改结果
            pg.fill("#wr-input", ANSWER)
            pg.wait_for_timeout(150)
            pg.click("#wr-grade")
            pg.wait_for_selector(".wr-result", timeout=15000)
            pg.wait_for_timeout(600)
            pg.screenshot(path=str(OUT / "wr-03-result.png"), full_page=True)

            # 4. 窄屏列表
            pg2 = ctx.new_page()
            pg2.set_viewport_size({"width": 390, "height": 844})
            pg2.goto(BASE + "#/writing", wait_until="domcontentloaded")
            pg2.wait_for_selector(".wr-card")
            pg2.wait_for_timeout(400)
            pg2.screenshot(path=str(OUT / "wr-04-mobile.png"), full_page=True)

            # 5. 暗色（点顶栏主题按钮切，别在 init script 里加 class：那时 html 还没建出来）
            pg3 = ctx.new_page()
            pg3.add_init_script("""
            try{ localStorage.setItem('typingcet.guest','1');
                 localStorage.setItem('typingcet.ai.v1', %s); }catch(e){}
            """ % json.dumps(json.dumps(CFG)))
            pg3.goto(BASE + "#/writing?id=tr-highspeed", wait_until="domcontentloaded")
            pg3.wait_for_selector("#wr-input")
            pg3.fill("#wr-input", ANSWER)
            pg3.wait_for_timeout(150)
            pg3.click("#theme-btn")   # 切暗色，顺便验证主题变量在这页也生效
            pg3.wait_for_timeout(400)
            pg3.click("#wr-grade")
            try:
                pg3.wait_for_selector(".wr-result", timeout=15000)
            except Exception:
                pass
            pg3.wait_for_timeout(500)
            pg3.screenshot(path=str(OUT / "wr-05-dark.png"), full_page=True)

            browser.close()
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass

    for f in sorted(OUT.glob("wr-0*.png")):
        print(f.name, f.stat().st_size // 1024, "KB")
    return 0


if __name__ == "__main__":
    os._exit(main())
