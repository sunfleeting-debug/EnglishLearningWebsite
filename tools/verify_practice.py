# -*- coding: utf-8 -*-
"""练习页「键盘操作」+「学完一组接着学下一组」的端到端核验（Playwright）。

对应 sunfleeting 提的两点：
  A) 键盘尽量代替鼠标
     · 翻卡：空格 / Enter 翻面 → Enter 认识 · Backspace 不认识 · S 发音 · Esc 跳过
     · 打字类：Enter 提交；**反馈阶段按 Enter 继续**
       （旧实现只在 flash 分支接管键盘，输入框被移除后按 Enter 没反应 —— 真 bug）
     · 1~4 切换练习模式；完成页 Enter = 主按钮
  B) 学完一组给「学习下一组」，且**下次进入练习从第一个还没学的词开始**
     （旧实现永远只练前 size 个词，学完 20 个再进来还是这 20 个）
  C) 进入新词**四个模式都自动朗读**（旧实现只有看词/听音两个模式，且听音分支重复调用
     两次 speak ⇒ 第二次 stopAudio 把第一次掐断，听起来像没读）；翻面重画不重复朗读
  D) 工具按钮全键盘可达：S 发音/重听 · F 收藏 · D 详解 · H 看中文提示
     （焦点在输入框时用 Alt+ 同字母，裸字母仍必须能正常输入）

用法（脚本会自己拉起静态服务）：
    NODE_OPTIONS= python -u tools/verify_practice.py
"""
import os
import pathlib
import re
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "5197"))
BASE = "http://127.0.0.1:%d/" % PORT

EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
PY = sys.executable or "python"

BOOK = "week2"          # 用一本干净的书做「推进」测试，避免与其它用例互相污染
SIZE = 2                # 每轮 2 个词，跑得快、断言清楚
A_SIZE = 6              # 键盘用例一轮要覆盖第 1~4 个词，会话得够长

checks = []
errors = []


def log(msg):
    print(msg, flush=True)


def check(name, got, want=True, extra=""):
    ok = got == want
    checks.append((ok, name))
    log(("  [OK]   " if ok else "  [FAIL] ") + name
        + (("  " + str(extra)) if extra else "")
        + ("" if ok else "  got=%r want=%r" % (got, want)))
    return ok


def port_free(p):
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", p)) != 0
    finally:
        s.close()


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


# ---------- 页面读数小工具 ----------

def flash_word(pg):
    """翻卡卡片上显示的单词（取不到时带出诊断串）"""
    return pg.evaluate("""() => {
      const el = document.querySelector('#p-card .word-display');
      return el ? el.textContent.trim() : 'MISSING >> ' + (document.querySelector('#p-stage') ? document.querySelector('#p-stage').innerText.slice(0, 80) : 'no #p-stage');
    }""")


def stage_word(pg):
    """#p-word 上显示的单词（打字类模式用它）"""
    return pg.evaluate("""() => {
      const el = document.querySelector('#p-word');
      return el ? el.textContent.trim() : 'MISSING';
    }""")


def act_count(pg, act):
    return pg.locator("[data-act='%s']" % act).count()


def active_tag(pg):
    return pg.evaluate("() => (document.activeElement && document.activeElement.tagName) || ''")


def book_ids(pg, book):
    return pg.evaluate("(b) => TW.data.byBook(b).map(w => w.id)", book)


def book_words(pg, book):
    return pg.evaluate("(b) => TW.data.byBook(b).map(w => w.word)", book)


def first_unlearned_index(pg, book):
    """按词表顺序找第一个还没学的词的下标（没有则 -1）"""
    return pg.evaluate("""(b) => {
      const list = TW.data.byBook(b);
      for (let i = 0; i < list.length; i++) {
        const p = TW.store.get(list[i].id);
        if (!p || !p.seen) return i;
      }
      return -1;
    }""", book)


def finish_text(pg):
    return pg.evaluate("""() => {
      const el = document.querySelector('#p-stage');
      return el ? el.innerText.replace(/\\s+/g, ' ') : 'MISSING';
    }""")


def main():
    if not port_free(PORT):
        log("端口 %d 被占用，先清掉再跑（MSYS_NO_PATHCONV=1 taskkill /PID <pid> /F）" % PORT)
        return 3

    procs = []
    log("启动静态服务 :%d" % PORT)
    procs.append(subprocess.Popen([PY, "tools/serve.py", "-p", str(PORT)], cwd=str(ROOT),
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
    try:
        if wait_http(BASE + "index.html") != 200:
            log("静态服务未就绪")
            return 3

        with sync_playwright() as pw:
            browser = pw.chromium.launch(**({"executable_path": str(EXE)} if EXE.exists() else {}))
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            pg = ctx.new_page()
            pg.on("console", lambda m: errors.append("console:" + m.text)
                  if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append("pageerror:" + str(e)))

            def goto(route, wait=700):
                pg.goto(BASE + route, wait_until="domcontentloaded")
                pg.wait_for_timeout(wait)

            def goto_fresh(route, wait=700):
                """相同 hash 不会触发 hashchange ⇒ 先绕回家再进目标路由"""
                if pg.evaluate("() => location.hash") == route:
                    pg.evaluate("() => { location.hash = '/'; }")
                    pg.wait_for_timeout(220)
                pg.goto(BASE + route, wait_until="domcontentloaded")
                pg.wait_for_timeout(wait)

            def press(key, wait=170):
                pg.keyboard.press(key)
                pg.wait_for_timeout(wait)

            def setup(page):
                """清空进度 + 关掉自动发音/自动下一词，让时序可控。

                🔴 必须用 store.resetAll()（内存 + 磁盘一起清）：
                只调 localStorage.clear() 的话内存里的 state 还在，紧接着 setSetting 会
                save() 把旧进度原样写回去 —— 症状是「以为清了，结果还是从上次的进度继续」。"""
                page.evaluate("""() => {
                  TW.store.resetAll();
                  TW.store.setSetting('autoNext', false);
                  TW.store.setSetting('autoPronounce', false);
                  TW.store.setSetting('sessionSize', %d);
                  TW.store.setSetting('order', 'seq');
                }""" % SIZE)

            # ================= A) 翻卡键盘 =================
            log("\n--- A) 翻卡：空格/Enter 翻面 · Enter 认识 · Backspace 不认识 · Esc 跳过 ---")
            goto("#/")
            setup(pg)
            goto_fresh("#/practice?book=%s&mode=flash&size=%d" % (BOOK, A_SIZE))
            check("翻卡页渲染出卡片", pg.locator("#p-card").count(), 1)

            # 用「词表下标」定位，不用 byWord 反查：
            # 词表里存在 bass① / specialize,-ise 这类写法，显示词与原始词形对不上，反查会拿到 null
            a_ids = book_ids(pg, BOOK)
            a_words = book_words(pg, BOOK)

            check("未翻面时显示第 1 个词", flash_word(pg), a_words[0])
            check("未翻面时没有「认识」按钮", act_count(pg, "known"), 0)
            check("未翻面时提示空格翻面",
                  "空格" in pg.evaluate("() => document.querySelector('#p-stage').innerText"), True)

            press("Enter")
            check("Enter 可以翻面（出现「认识」按钮）", act_count(pg, "known"), 1)
            check("翻面后提示 Enter 认识 / Backspace 不认识",
                  pg.evaluate("""() => {
                    const t = document.querySelector('#p-stage').innerText;
                    return t.includes('Enter') && t.includes('Backspace');
                  }"""), True)

            press("Enter")
            check("翻面后 Enter = 认识（进入反馈）", act_count(pg, "next"), 1)
            check("「认识」记进了进度（seen+1, r+1）",
                  pg.evaluate("""(id) => {
                    const p = TW.store.get(id);
                    return !!p && p.seen >= 1 && p.r >= 1;
                  }""", a_ids[0]), True)

            press("Enter")
            check("反馈阶段 Enter = 继续（换到第 2 个词）", flash_word(pg), a_words[1])

            press("Space")          # 空格也翻面
            check("空格也能翻面", act_count(pg, "known"), 1)
            press("Backspace")
            check("Backspace = 不认识（进入反馈）", act_count(pg, "next"), 1)
            check("「不认识」记为答错（w+1）",
                  pg.evaluate("""(id) => {
                    const p = TW.store.get(id);
                    return !!p && p.w >= 1;
                  }""", a_ids[1]), True)

            press("Enter")
            check("反馈阶段 Enter 继续后换到第 3 个词", flash_word(pg), a_words[2])

            seen_before = pg.evaluate("""(id) => {
              const p = TW.store.get(id);
              return p ? p.seen : 0;
            }""", a_ids[2])
            press("Escape")
            # 数组整体作为一个参数传（避免 evaluate 的 % 格式化踩坑）
            check("答题中 Esc = 跳过并记错",
                  pg.evaluate("""([id, before]) => {
                    const p = TW.store.get(id);
                    return !!p && p.w >= 1 && p.seen > before;
                  }""", [a_ids[2], seen_before]), True)
            check("跳过后进入第 4 个词", flash_word(pg), a_words[3])

            # ================= B) 1~4 换模式 =================
            log("\n--- B) 键盘 1~4 切换练习模式 ---")
            # 翻卡下焦点不在输入框，1~4 直接生效
            press("2")
            check("按 2 切到「看中文拼写」", "mode=recall" in pg.evaluate("() => location.hash"), True)
            # 打字类模式一进来焦点就在输入框里 ⇒ 1~4 必须让路，否则打不出数字
            check("打字模式焦点确实在输入框里", active_tag(pg), "INPUT")
            pg.evaluate("() => { const el = document.activeElement; if (el && el.blur) el.blur(); }")
            press("4")
            check("输入框失焦后按 4 切回「翻卡记忆」",
                  "mode=flash" in pg.evaluate("() => location.hash"), True)

            goto_fresh("#/practice?book=%s&mode=type&size=%d" % (BOOK, A_SIZE))
            pg.click("#p-input")
            pg.type("#p-input", "12")
            check("输入框里能正常打出数字（1~4 没被抢键）",
                  pg.evaluate("() => document.querySelector('#p-input').value"), "12")
            check("打字时模式没被误切换", "mode=type" in pg.evaluate("() => location.hash"), True)

            # ================= C) 打字模式：反馈阶段 Enter 继续 =================
            log("\n--- C) 打字模式反馈阶段 Enter 继续（旧实现按 Enter 无反应）---")
            goto_fresh("#/practice?book=%s&mode=type&size=%d" % (BOOK, SIZE))
            check("打字模式有输入框", pg.locator("#p-input").count(), 1)
            w_typed = stage_word(pg)
            pg.fill("#p-input", w_typed)
            press("Enter")
            check("答对后进入反馈（出现「继续」按钮）", act_count(pg, "next"), 1)
            check("反馈阶段输入框已被移除", pg.locator("#p-input").count(), 0)
            check("反馈阶段焦点回到 body（键盘交给文档级监听）", active_tag(pg), "BODY")
            press("Enter")
            check("反馈阶段 Enter 能继续到下一词", pg.locator("#p-input").count(), 1)
            check("继续后确实换了词", stage_word(pg) != w_typed, True)

            # ================= D) 学下一组 + 从没学的开始 =================
            log("\n--- D) 完成页「学习下一组」+ 下次从第一个没学的词开始 ---")
            goto("#/")
            setup(pg)
            goto_fresh("#/practice?book=%s&mode=flash&size=%d" % (BOOK, SIZE))

            total = len(book_words(pg, BOOK))
            words = book_words(pg, BOOK)
            log("    词书 %s 共 %d 词，每轮 %d 词" % (BOOK, total, SIZE))

            def complete_round(page, n):
                """翻卡模式下把 n 个词全部「认识」（每个词：翻面 → 认识 → 继续）"""
                for _ in range(n):
                    press("Enter")
                    press("Enter")
                    press("Enter")

            # 第 1 轮：词表前 2 个
            check("首次进入从第 1 个词开始", flash_word(pg), words[0])
            complete_round(pg, SIZE)
            t1 = finish_text(pg)
            check("完成页出现「学习下一组」", act_count(pg, "nextgroup"), 1)
            check("完成页按钮文案含「学习下一组」", "学习下一组" in t1, True)
            m = re.search(r"还有\s*(\d+)\s*个词没学", t1)
            check("完成页显示剩余未学词数 = %d" % (total - SIZE),
                  int(m.group(1)) if m else None, total - SIZE)

            # 「再来一轮」= 同一批词重练（不推进）
            pg.locator("[data-act='again']").click()
            pg.wait_for_timeout(700)
            check("「再来一轮」重练同一批词（首个词不变）", flash_word(pg), words[0])
            complete_round(pg, SIZE)

            # 完成页按 Enter = 主按钮 = 学习下一组
            press("Enter")
            check("完成页 Enter = 学习下一组（已推进到第 %d 个词）" % (SIZE + 1),
                  flash_word(pg), words[SIZE])
            check("推进的起点 = 第一个还没学的词",
                  first_unlearned_index(pg, BOOK), SIZE)

            complete_round(pg, SIZE)
            t2 = finish_text(pg)
            m2 = re.search(r"还有\s*(\d+)\s*个词没学", t2)
            check("再学一轮后剩余 = %d" % (total - SIZE * 2),
                  int(m2.group(1)) if m2 else None, total - SIZE * 2)

            # 直接重进练习页（模拟「下次点击学习」）⇒ 仍从第一个没学的词开始
            goto_fresh("#/practice?book=%s&mode=flash&size=%d" % (BOOK, SIZE))
            check("重进练习页从第一个没学的词开始（第 %d 个）" % (SIZE * 2 + 1),
                  flash_word(pg), words[SIZE * 2])

            # 全部学完时：不再显示「学习下一组」，只给「再来一轮」
            # 造出「整本都学过」的状态，并 **save()** —— 下面 goto_fresh 会整页重载，
            # 只写内存不落盘的话重载后进度就没了，断言会假通过
            pg.evaluate("""(b) => {
              TW.data.byBook(b).forEach(w => {
                const p = TW.store.state.progress[w.id] ||
                  (TW.store.state.progress[w.id] = {w:0,r:0,seen:0,fav:false,master:false,ts:0});
                p.seen = p.seen || 1;
              });
              TW.store.save();
            }""", BOOK)
            goto_fresh("#/practice?book=%s&mode=flash&size=%d" % (BOOK, SIZE))
            complete_round(pg, SIZE)
            t3 = finish_text(pg)
            check("全部学完后不再显示「学习下一组」", act_count(pg, "nextgroup"), 0)
            check("全部学完后给出「已经全部学完」提示", "全部学完" in t3, True)
            check("全部学完后「再来一轮」仍是主按钮",
                  pg.locator("[data-act='again'].primary").count(), 1)

            # ================= F) 自动读下一个词 + 工具键 =================
            log("\n--- F) 进入新词自动发音（四个模式都有）+ 工具键 S/F/D/H ---")
            goto("#/")
            setup(pg)
            # 这一节要考「自动发音」，把它打开（setup 里为了时序可控关掉了）
            pg.evaluate("() => TW.store.setSetting('autoPronounce', true)")

            def spy_speak(page):
                """把发音换成记录器。drawStage 里的 setTimeout 到点才取 TW.speech.speak，
                   所以替换属性就能拦住（headless 里也避免真去播音频）。"""
                page.evaluate("""() => {
                  window.__twSpoke = [];
                  TW.speech.speak = function (t) { window.__twSpoke.push(t); };
                }""")

            def spoke(page):
                return page.evaluate("() => (window.__twSpoke || []).slice()")

            words6 = book_words(pg, BOOK)

            def clean_enter(mode):
                """每个模式前都清一次进度：会话是「从第一个还没学的词切起」，
                   Esc 跳过会记错，不清的话下一个模式的起点会往后漂（第 2、3、4 个词…）。"""
                goto("#/")
                setup(pg)
                pg.evaluate("() => TW.store.setSetting('autoPronounce', true)")
                goto_fresh("#/practice?book=%s&mode=%s&size=%d" % (BOOK, mode, A_SIZE))

            for mode in ("type", "recall", "listen", "flash"):
                clean_enter(mode)
                spy_speak(pg)
                # Esc（答题中）= 跳过 → 进入第 2 个词；四种模式都支持
                press("Escape")
                pg.wait_for_timeout(450)          # 自动发音有 150ms 延迟
                got = spoke(pg)
                check("[%s] 跳到第 2 个词时自动读了它" % mode,
                      got[-1] if got else None, words6[1])

            # 同一题重画（看中文提示 / 翻面）不该把同一个词读两遍
            clean_enter("flash")
            spy_speak(pg)
            press("Escape")
            pg.wait_for_timeout(300)
            n1 = len(spoke(pg))
            press("Space")                        # 翻面 → drawStage 重画
            pg.wait_for_timeout(300)
            check("翻面重画不会重复朗读同一个词", len(spoke(pg)), n1)

            # ---- 工具键（焦点不在输入框：裸字母）----
            clean_enter("flash")
            spy_speak(pg)
            # clean_enter 保证了会话从第 1 个词（= a_ids[0]）开始，收藏键作用的正是它
            fid = a_ids[0]
            check("会话确实从第 1 个词开始（下面的收藏断言依赖它）",
                  pg.evaluate("() => document.querySelector('#p-card .word-display').textContent.trim()"),
                  words6[0])
            pg.evaluate("(id) => { const p = TW.store.get(id); if (p) p.fav = false; }", fid)
            press("f")
            check("F = 收藏（写入进度）",
                  pg.evaluate("(id) => !!(TW.store.get(id) || {}).fav", fid), True)
            check("F 收藏后按钮文案变「已收藏」",
                  pg.evaluate("""() => {
                    const b = document.querySelector('[data-act="fav"]');
                    return b ? b.innerText.indexOf('已收藏') >= 0 : 'MISSING';
                  }"""), True)
            press("f")
            check("再按 F = 取消收藏",
                  pg.evaluate("(id) => !!(TW.store.get(id) || {}).fav", fid), False)

            before = len(spoke(pg))
            press("s")
            pg.wait_for_timeout(250)
            check("S = 发音（调用了 speak）", len(spoke(pg)) > before, True)

            check("工具按钮上都标了快捷键",
                  pg.evaluate("""() => {
                    const t = document.querySelector('#p-stage').innerText;
                    return t.includes('发音') && t.includes('收藏') && t.includes('详解');
                  }"""), True)

            # ---- 打字时：裸字母还是字母，工具键走 Alt+ ----
            goto_fresh("#/practice?book=%s&mode=type&size=%d" % (BOOK, A_SIZE))
            spy_speak(pg)
            check("打字模式焦点在输入框", active_tag(pg), "INPUT")
            pg.click("#p-input")
            pg.type("#p-input", "sfd")
            check("输入框里裸字母正常输入（没被工具键抢走）",
                  pg.evaluate("() => document.querySelector('#p-input').value"), "sfd")
            pg.fill("#p-input", "")
            before = len(spoke(pg))
            pg.keyboard.press("Alt+s")
            pg.wait_for_timeout(250)
            check("打字时 Alt+S = 发音", len(spoke(pg)) > before, True)
            check("Alt+S 没往输入框里塞字符",
                  pg.evaluate("() => (document.querySelector('#p-input')||{}).value || ''"), "")

            # ---- D = 详解（跳到词典页）----
            goto_fresh("#/practice?book=%s&mode=flash&size=%d" % (BOOK, A_SIZE))
            press("d")
            pg.wait_for_timeout(1200)          # 详解要按需加载 dict.js（3.9M）
            check("D = 打开详解页", "#/word" in pg.evaluate("() => location.hash"), True)
            check("详解页确实渲染出来了", pg.locator("#dc-back").count() > 0, True)

            # ================= E) 控制台 =================
            log("\n--- E) 控制台 ---")
            real = [e for e in errors]
            check("控制台错误数 = 0", len(real), 0,
                  extra=("；".join(real[:3]) if real else ""))

            # 🔴 不要调 browser.close()：Playwright 的 close() 偶尔会永久挂住
            #（实测卡在这里 5 分钟没输出、也不报错），断言已经跑完了却拿不到退出码。
            # 下面的 finally 收掉静态服务，再由 os._exit 直接结束进程，
            # chromium 子进程随父进程管道断开自行退出（verify_site.py 一直是这么做的）。
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass

    log("")
    failed = [n for ok, n in checks if not ok]
    log("失败 %d / 共 %d 项断言" % (len(failed), len(checks)))
    for n in failed:
        log("  - " + n)
    sys.stdout.flush()
    os._exit(0 if not failed else 3)


if __name__ == "__main__":
    main()
