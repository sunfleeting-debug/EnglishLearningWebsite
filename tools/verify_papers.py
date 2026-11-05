# -*- coding: utf-8 -*-
"""核验 AI 出「整套题」：选词填空 10 空 / 整篇阅读 / 段落匹配
   ------------------------------------------------------------
   覆盖从「AI 回复里的 ```quiz 块」到「题目板块里的 cloze 套题」整条链路：
   解析（normalizeCloze）→ 聊天卡片（正文挖空 + A~O 词库 + 点选）→ 判分
   → 发布（TW.quiz.publish kind=cloze）→ 作答页（原生选词填空渲染）。
   /api/ai/chat 用桩替换，不需要真 Key。

   用法：python tools/verify_papers.py
"""
import json
import os
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 5181
BASE = "http://127.0.0.1:%d/" % PORT
PY = sys.executable

CLOZE = {
    "setType": "cloze",
    "title": "AI 原创 · 选词填空 10 空",
    "body": [
        "For decades, researchers have tried to 【1】 which habits separate the best teams "
        "from the rest, and the answers have often been 【2】. A recent study of 240 firms "
        "suggests that what matters is not individual talent but the daily routines that "
        "【3】 good practice over the years.",
        "The authors are 【4】 to claim that conflict is always harmful. Occasional 【5】, "
        "they argue, forces a team to examine assumptions it would otherwise take for "
        "granted. What matters is whether disagreement stays focused on the task; teams "
        "that never argue are not harmonious, they are simply silent, and silence can "
        "【6】 trust.",
        "Their conclusion is 【7】: a team that never disagrees is not healthy, it is merely "
        "quiet. Managers who want to 【8】 the benefit of candour must make it safe to speak "
        "up. Yet old habits are 【9】, and leaders often prefer to 【10】 new rules on staff "
        "rather than question a culture that has served the firm well."
    ],
    "bank": ["A. alleviate", "B. ambiguous", "C. anticipate", "D. comply",
             "E. consecutive", "F. controversy", "G. deteriorate", "H. impose",
             "I. inevitable", "J. maintain", "K. notorious", "L. persistent",
             "M. reluctant", "N. sustain", "O. undermine"],
    "exercises": [
        {"n": 1, "answer": "C", "explanation": "anticipate 预料；anticipate which habits 预见哪些习惯"},
        {"n": 2, "answer": "B", "explanation": "ambiguous 模棱两可的；answers are ambiguous"},
        {"n": 3, "answer": "N", "explanation": "sustain 维持；sustain good practice 保持好做法"},
        {"n": 4, "answer": "M", "explanation": "be reluctant to 不愿做某事"},
        {"n": 5, "answer": "F", "explanation": "controversy 争论；occasional controversy 偶发的争论"},
        {"n": 6, "answer": "O", "explanation": "undermine 侵蚀；undermine trust 损害信任"},
        {"n": 7, "answer": "I", "explanation": "inevitable 必然的；conclusion is inevitable"},
        {"n": 8, "answer": "J", "explanation": "maintain 保持；maintain the benefit 维持好处"},
        {"n": 9, "answer": "L", "explanation": "persistent 顽固的；old habits are persistent"},
        {"n": 10, "answer": "H", "explanation": "impose ... on 把…强加于；impose rules on staff"},
    ],
}

REPLY = ("这篇讲团队里「沉默」的代价，十个空都从词库里选。\n\n```quiz\n"
         + json.dumps(CLOZE, ensure_ascii=False) + "\n```")
BODY = {"v": REPLY}          # 一个上下文里要换好几种回复，用容器装着

fails = []


TOTAL = [0]


def check(name, got, want, extra=""):
    TOTAL[0] += 1
    ok = got == want
    if not ok:
        fails.append(name)
    print(("  [OK]   " if ok else "  [FAIL] ") + name
          + ("  " + str(extra) if extra != "" else "")
          + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def port_free(p):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", p)) != 0
    finally:
        s.close()


def wait_http(url, timeout=15):
    import urllib.request
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                return r.status
        except Exception:
            time.sleep(0.3)
    return 0


def sse(text):
    chunks = []
    for i in range(0, len(text), 40):
        chunks.append(json.dumps({"choices": [{"delta": {"content": text[i:i + 40]}}]}, ensure_ascii=False))
    chunks.append("[DONE]")
    return "".join("data: %s\n\n" % c for c in chunks)


def main():
    if not port_free(PORT):
        print("端口被占用")
        return 3
    procs = [subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    try:
        if wait_http(BASE + "index.html") != 200:
            print("静态服务未就绪")
            return 3
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1280, "height": 1000})
            # Key + 默认模型齐全，AI 页直接进聊天界面
            cfg = {"provider": "deepseek",
                   "keys": {"deepseek": "sk-test-000000000000"},
                   "models": {"deepseek": "deepseek-chat"},
                   "baseUrl": "", "modelLists": {}}
            ctx.add_init_script("localStorage.setItem('typingcet.ai.v1', %s)"
                                % json.dumps(json.dumps(cfg, ensure_ascii=False), ensure_ascii=False))
            ctx.add_init_script("localStorage.setItem('typingcet.guest','1')")

            def chat(route):
                body = json.loads(route.request.post_data or "{}")
                if body.get("stream"):
                    route.fulfill(status=200, content_type="text/event-stream",
                                  headers={"Access-Control-Allow-Origin": "*"}, body=sse(BODY["v"]))
                else:
                    route.fulfill(status=200, content_type="application/json",
                                  headers={"Access-Control-Allow-Origin": "*"},
                                  body=json.dumps({"text": BODY["v"]}, ensure_ascii=False))

            ctx.route("**/api/ai/chat", chat)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append("console:" + m.text) if m.type == "error" else None)

            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.reload(wait_until="domcontentloaded")   # 同 URL 的 goto 不重载，旧卡片会留在页面里
            pg.wait_for_selector("#ai-input", timeout=15000)
            pg.fill("#ai-input", "给我一篇完整的十个空的选词填空，要有一整篇材料")
            pg.keyboard.press("Enter")
            pg.wait_for_selector(".ai-cloze", timeout=25000)
            pg.wait_for_timeout(300)

            check("渲染成整篇 cloze 卡片", pg.eval_on_selector_all(".ai-cloze", "e=>e.length"), 1)
            check("正文 10 个可点空位", pg.eval_on_selector_all(".ai-cloze .qz-blank", "e=>e.length"), 10)
            check("词库 15 个词", pg.eval_on_selector_all(".ai-cloze .qz-word", "e=>e.length"), 15)
            check("材料三段", pg.eval_on_selector_all(".ai-cloze .qz-mat .qz-p", "e=>e.length"), 3)
            tx = pg.inner_text(".ai-cloze .qz-mat")
            check("材料是完整文章", "For decades, researchers" in tx and "served the firm well" in tx, True)

            pg.locator(".ai-cloze").screenshot(path=os.path.join(ROOT, "tools/_shots/ai-cloze-card.png"))
            # 填第 1 空（正确 C）
            pg.click('.ai-cloze .qz-blank[data-cz="0"]')
            pg.wait_for_timeout(120)
            pg.click('.ai-cloze .qz-word[data-czb="C"]')
            pg.wait_for_timeout(250)
            check("点空位+点词库能填", pg.inner_text('.ai-cloze .qz-blank[data-cz="0"]').strip(), "C")
            # 第 2 空填错（填 A，正确 B）
            pg.click('.ai-cloze .qz-blank[data-cz="1"]')
            pg.wait_for_timeout(120)
            pg.click('.ai-cloze .qz-word[data-czb="A"]')
            pg.wait_for_timeout(250)
            check("已填的字母出现在空位", pg.inner_text('.ai-cloze .qz-blank[data-cz="1"]').strip(), "A")
            # 再点一次已填空位 → 清空
            pg.click('.ai-cloze .qz-blank[data-cz="1"]')
            pg.wait_for_timeout(200)
            check("再点已填空位可清空", pg.inner_text('.ai-cloze .qz-blank[data-cz="1"]').strip(), "2")
            # 重新填错的那个
            pg.click('.ai-cloze .qz-blank[data-cz="1"]')
            pg.wait_for_timeout(100)
            pg.click('.ai-cloze .qz-word[data-czb="A"]')
            pg.wait_for_timeout(200)

            pg.click('.ai-quizbox-f button[data-act="grade"]')
            pg.wait_for_timeout(500)
            check("判分按空计：答对 1/10",
                  "答对 1" in pg.inner_text(".ai-cloze .ai-quizbox-h"), True,
                  )
            check("逐空解析 10 条", pg.eval_on_selector_all(".ai-cloze .qz-qs .qz-q", "e=>e.length"), 10)
            check("错的 9 空在正文显示正确答案", pg.eval_on_selector_all(".ai-cloze .qz-fix", "e=>e.length"), 9)
            pg.screenshot(path=os.path.join(ROOT, "tools/_shots/ai-cloze-graded.png"), full_page=True)

            # 发布 → 题目板块里应是原生 cloze 套题
            pg.click('.ai-quizbox-f button[data-act="publish"]')
            pg.wait_for_timeout(600)
            info = pg.evaluate("""() => {
                const s = TW.quiz.published().filter(x => x.type === 'cloze');
                if (!s.length) return '';
                const z = s[0];
                return [z.id, z.questions.length, (z.bank || []).length, (z.body || []).length,
                        z.questions[0].answer, z.questions[0].key].join('|');
            }""")
            p = info.split("|")
            check("发布后 type=cloze", bool(p[0]), True)
            check("发布后 10 题", p[1] if len(p) > 1 else "", "10")
            check("发布后 15 项词库", p[2] if len(p) > 2 else "", "15")
            check("发布后 3 段材料", p[3] if len(p) > 3 else "", "3")
            check("答案与词条都带上了", (p[4], p[5]) if len(p) > 5 else "", ("C", "anticipate"))

            if p[0]:
                pg.goto(BASE + "#/quiz?set=" + p[0], wait_until="domcontentloaded")
                pg.wait_for_timeout(1000)
                check("作答页正文 10 个空位", pg.eval_on_selector_all(".qz-mat .qz-blank", "e=>e.length"), 10)
                check("作答页词库 15 个", pg.eval_on_selector_all(".qz-bank .qz-word", "e=>e.length"), 15)
                check("作答页是「选词填空」标签", "选词填空" in pg.inner_text(".qz-mat-h-row"), True)
                pg.screenshot(path=os.path.join(ROOT, "tools/_shots/ai-cloze-quiz.png"), full_page=True)

            # ---------------- 整篇仔细阅读：一篇 + 5 道四选一 ----------------
            READING = {
                "setType": "reading",
                "title": "为什么短会开得更久",
                "heading": "Why short meetings last longer",
                "body": [
                    "Ask a manager why meetings drag on and the answer usually blames the agenda. "
                    "A study of 1,200 meetings in three countries suggests something less obvious: "
                    "the length people are given is itself the problem.",
                    "When organisers booked thirty minutes, discussion filled thirty minutes and "
                    "ended with a decision. When they booked an hour for the same item, discussion "
                    "filled the hour, added two side topics, and ended with a promise to follow up.",
                    "The researchers call this the parking-lot effect. A long slot signals that the "
                    "issue is complicated, so participants arrive expecting to talk rather than decide.",
                    "The remedy is not simply shorter calendars. Teams that set a decision at the top "
                    "of the invitation and left the duration blank resolved more items per hour than "
                    "any other group in the sample."
                ],
                "exercises": [
                    {"question": "What does the study identify as the main cause of long meetings?",
                     "options": ["Poor agendas", "The allotted duration", "Too many participants",
                                 "Unclear decisions"],
                     "answer": "B", "explanation": "第一段：the length people are given is itself the problem"},
                    {"question": "What happened when an hour was booked for the same item?",
                     "options": ["The discussion was cut short", "Side topics were added",
                                 "Fewer people attended", "The decision was postponed twice"],
                     "answer": "B", "explanation": "第二段：added two side topics"},
                    {"question": "What does the parking-lot effect refer to?",
                     "options": ["Parking is discussed before meetings", "A long slot suggests complexity",
                                 "Meetings move outdoors", "Agendas are written in advance"],
                     "answer": "B", "explanation": "第三段：A long slot signals that the issue is complicated"},
                    {"question": "Which measure worked best in the study?",
                     "options": ["Shorter calendars", "Naming the decision up front",
                                 "Fewer invitations", "Longer follow-up calls"],
                     "answer": "B", "explanation": "第四段：set a decision at the top of the invitation"},
                    {"question": "What is the author's overall attitude to shorter meetings?",
                     "options": ["They are useful only for small teams", "They are not the whole answer",
                                 "They are impossible to enforce", "They are the single best remedy"],
                     "answer": "B", "explanation": "第四段：The remedy is not simply shorter calendars"},
                ],
            }
            BODY["v"] = ("这篇讲会议时长怎么反过来决定讨论长度。\n\n```quiz\n"
                         + json.dumps(READING, ensure_ascii=False) + "\n```")
            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.reload(wait_until="domcontentloaded")   # 同 URL 的 goto 不重载，旧卡片会留在页面里
            pg.wait_for_selector("#ai-input", timeout=15000)
            pg.fill("#ai-input", "给我一整篇仔细阅读，五道四选一，要带文章")
            pg.keyboard.press("Enter")
            pg.wait_for_selector(".ai-paper", timeout=25000)
            pg.wait_for_timeout(300)
            check("阅读渲染成整套卡片", pg.eval_on_selector_all(".ai-paper", "e=>e.length"), 1)
            check("阅读材料 4 段", pg.eval_on_selector_all(".ai-paper .qz-mat .qz-p", "e=>e.length"), 4)
            check("阅读 5 道题", pg.eval_on_selector_all(".ai-paper .ai-q", "e=>e.length"), 5)
            check("每题 4 个英文选项", pg.eval_on_selector_all(".ai-paper .ai-q:first-child .ai-opt", "e=>e.length"), 4)
            pg.click('.ai-paper .ai-q:first-child .ai-opt >> nth=1')   # B 正确
            pg.wait_for_timeout(150)
            pg.click('.ai-paper .ai-q:nth-child(2) .ai-opt >> nth=1')   # 第 2 题 B 正确
            pg.wait_for_timeout(150)
            pg.click('.ai-paper .ai-q:nth-child(3) .ai-opt >> nth=0')  # 第 3 题选 A（错）
            pg.wait_for_timeout(150)
            pg.click('.ai-paper button[data-act="grade"]')
            pg.wait_for_timeout(500)
            check("阅读判分 2/5",
                  "答对 2" in pg.inner_text(".ai-paper .ai-quizbox-h"), True,
                  pg.inner_text(".ai-paper .ai-quizbox-h"))
            pg.click('.ai-paper button[data-act="publish"]')
            pg.wait_for_timeout(700)
            rid2 = pg.evaluate("""() => {
                const s = TW.quiz.published().filter(x => x.type === 'reading');
                return s.length ? [s[0].id, (s[0].body || []).length, s[0].questions.length,
                                   s[0].questions[0].options.length].join('|') : '';
            }""")
            p2 = rid2.split("|")
            check("阅读发布为原生 reading 套题", bool(p2 and p2[0]), True, p2[0] if p2 else "")
            check("阅读发布带 4 段材料", p2[1] if len(p2) > 1 else "", "4")
            check("阅读发布 5 题四选一", (p2[2], p2[3]) if len(p2) > 3 else "", ("5", "4"))
            if p2[0]:
                pg.goto(BASE + "#/quiz?set=" + p2[0], wait_until="domcontentloaded")
                pg.wait_for_timeout(900)
                check("阅读作答页材料 4 段", pg.eval_on_selector_all(".qz-mat .qz-p", "e=>e.length"), 4)
                check("阅读作答页 5 题", pg.eval_on_selector_all(".qz-qs .qz-q", "e=>e.length"), 5)
                check("阅读作答页选项 20 个（5×4）", pg.eval_on_selector_all(".qz-opt", "e=>e.length"), 20)
                pg.screenshot(path=os.path.join(ROOT, "tools/_shots/ai-reading.png"), full_page=True)

            # ---------------- 整篇段落匹配：十几段 + 10 道找段落 ----------------
            LETTERS = "ABCDEFGHIJ"
            PARAS = [
                ("A", "The idea is simple enough to fit on a poster: everyone should reach the things "
                      "they need within a quarter of an hour on foot or by bike. The concept was "
                      "developed by Carlos Moreno, a professor based in Paris."),
                ("B", "Critics point out that the model assumes a dense city with reliable pavements "
                      "and mild weather. In sprawling suburbs the same fifteen minutes buys a drive "
                      "to a car park and nothing else."),
                ("C", "Retailers were the first to notice the shift. A supermarket that once counted "
                      "on weekend traffic now measures success by how many residents pass its door "
                      "on a Tuesday morning."),
                ("D", "The pandemic accelerated the change. People who had worked from home for a year "
                      "rediscovered the shops on their own street and were reluctant to give the time back."),
                ("E", "Not every service can move. Hospitals, universities and specialist clinics need "
                      "a catchment far larger than a neighbourhood, and concentrating them locally "
                      "would raise costs rather than lower them."),
                ("F", "Some cities have redrawn planning rules so that a new district must include "
                      "a school, a clinic and a grocery before the first apartments are sold."),
                ("G", "The most cited objection is cost. Retrofitting a suburb with shops and clinics "
                      "is expensive, and the benefits arrive years after the bill."),
                ("H", "Yet the accounting usually ignores the time saved. One estimate puts the value "
                      "of an hour not spent commuting at roughly the hourly wage of the commuter."),
                ("I", "Residents who were consulted rarely asked for more shops. They asked for shade, "
                      "benches and crossings, the small things that decide whether a walk feels possible."),
                ("J", "Officials now prefer the phrase 'complete neighbourhood' to the original slogan, "
                      "in part because the number fifteen invited arguments about what should be counted."),
            ]
            MATCH = {
                "setType": "match",
                "title": "城市 15 分钟生活圈",
                "heading": "The 15-minute city",
                "paras": [{"k": k, "text": v} for k, v in PARAS],
                "exercises": [
                    {"question": "A professor in Paris is credited with developing the concept.",
                     "answer": "A", "explanation": "A 段：developed by Carlos Moreno, a professor based in Paris"},
                    {"question": "The approach is said to work poorly where homes are spread out.",
                     "answer": "B", "explanation": "B 段：In sprawling suburbs the same fifteen minutes buys a drive"},
                    {"question": "A retailer now judges a weekday morning as the important period.",
                     "answer": "C", "explanation": "C 段：measures success by ... on a Tuesday morning"},
                    {"question": "Working at home made residents value nearby shops more.",
                     "answer": "D", "explanation": "D 段：rediscovered the shops on their own street"},
                    {"question": "Some services are too large to be provided locally.",
                     "answer": "E", "explanation": "E 段：Hospitals, universities ... need a catchment far larger"},
                    {"question": "New developments may be required to include basic amenities.",
                     "answer": "F", "explanation": "F 段：redrawn planning rules so that a new district must include"},
                    {"question": "The expense of adapting existing areas is a common objection.",
                     "answer": "G", "explanation": "G 段：Retrofitting a suburb ... is expensive"},
                    {"question": "Time saved is often left out of the calculation.",
                     "answer": "H", "explanation": "H 段：the accounting usually ignores the time saved"},
                    {"question": "People asked for physical comforts rather than more businesses.",
                     "answer": "I", "explanation": "I 段：They asked for shade, benches and crossings"},
                    {"question": "The wording of the slogan itself caused dispute.",
                     "answer": "J", "explanation": "J 段：the number fifteen invited arguments"},
                ],
            }
            BODY["v"] = ("这套是十段的段落匹配，每句陈述只对应一段。\n\n```quiz\n"
                         + json.dumps(MATCH, ensure_ascii=False) + "\n```")
            pg.goto(BASE + "#/ai", wait_until="domcontentloaded")
            pg.reload(wait_until="domcontentloaded")   # 同 URL 的 goto 不重载，旧卡片会留在页面里
            pg.wait_for_selector("#ai-input", timeout=15000)
            pg.fill("#ai-input", "给我一篇段落匹配，十几段那种，十个题")
            pg.keyboard.press("Enter")
            pg.wait_for_selector(".ai-paper", timeout=25000)
            pg.wait_for_timeout(300)
            check("匹配材料 10 段", pg.eval_on_selector_all(".ai-paper .qz-mat .qz-p", "e=>e.length"), 10)
            check("匹配 10 题", pg.eval_on_selector_all(".ai-paper .ai-q", "e=>e.length"), 10)
            check("每题给 10 个段落字母按钮",
                  pg.eval_on_selector_all(".ai-paper .ai-q:first-child .ai-opt", "e=>e.length"), 10)
            pg.click('.ai-paper .ai-q:first-child .ai-opt >> nth=0')   # A 正确
            pg.wait_for_timeout(150)
            pg.click('.ai-paper button[data-act="grade"]')
            pg.wait_for_timeout(500)
            check("匹配判分 1/10",
                  "答对 1" in pg.inner_text(".ai-paper .ai-quizbox-h"), True,
                  pg.inner_text(".ai-paper .ai-quizbox-h"))
            pg.click('.ai-paper button[data-act="publish"]')
            pg.wait_for_timeout(700)
            mid = pg.evaluate("""() => {
                const s = TW.quiz.published().filter(x => x.type === 'match');
                return s.length ? [s[0].id, (s[0].paras || []).length, s[0].questions.length,
                                   s[0].questions[0].answer].join('|') : '';
            }""")
            p3 = mid.split("|")
            check("匹配发布为原生 match 套题", bool(p3 and p3[0]), True, p3[0] if p3 else "")
            check("匹配发布带 10 段", p3[1] if len(p3) > 1 else "", "10")
            check("匹配发布 10 题、答案是段落字母",
                  (p3[2], p3[3]) if len(p3) > 3 else "", ("10", "A"))
            if p3[0]:
                pg.goto(BASE + "#/quiz?set=" + p3[0], wait_until="domcontentloaded")
                pg.wait_for_timeout(900)
                check("匹配作答页 10 段", pg.eval_on_selector_all(".qz-mat .qz-p", "e=>e.length"), 10)
                check("匹配作答页 10 题", pg.eval_on_selector_all(".qz-qs .qz-q", "e=>e.length"), 10)
                check("匹配作答页题型标签", "段落匹配" in pg.inner_text(".qz-mat-h-row"), True)
                pg.screenshot(path=os.path.join(ROOT, "tools/_shots/ai-match.png"), full_page=True)

            check("无 JS 报错", [e for e in errs if "example.invalid" not in e and "ERR_NAME_NOT_RESOLVED" not in e], [])
            b.close()
    finally:
        for x in procs:
            try:
                x.terminate()
            except Exception:
                pass

    print("\n通过 %d / %d 项" % (TOTAL[0] - len(fails), TOTAL[0]))
    if fails:
        print("失败：" + "；".join(fails))
    return 0 if not fails else 1


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    os._exit(code)
