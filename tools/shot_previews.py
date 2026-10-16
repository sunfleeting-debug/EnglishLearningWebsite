# -*- coding: utf-8 -*-
"""重拍 README 预览截图（docs/preview-*.png）。
先注入一套演示学习数据（本周词部分已学/部分答错进复习队列 + 近 10 天练习量），
再依次截 首页 / 词库 / 练习 / 复习 / 词典详解 / 句子练习 六张。
用法：先起 `python tools/serve.py`，再 `python tools/shot_previews.py`。
"""
import pathlib
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/"
EXE = pathlib.Path(r"C:\Users\Lenovo\AppData\Local\ms-playwright"
                   r"\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe")
OUT = pathlib.Path("docs")

# 近 10 天演示练习量（done, right），最后一项是今天
DEMO_DAILY = [(28, 24), (35, 30), (22, 19), (41, 36), (18, 15),
              (30, 27), (25, 22), (38, 33), (26, 23), (24, 21)]

errors = []
with sync_playwright() as pw:
    kw = {"executable_path": str(EXE)} if EXE.exists() else {}
    b = pw.chromium.launch(**kw)
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))

    # ---------- 注入演示数据 ----------
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(600)
    seeded = pg.evaluate("""() => {
      function localKey(d) {
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());  // 本地日期，勿用 toISOString（UTC）
      }
      TW.store.resetAll();
      var words = TW.WORDS.slice(0, 26);          // 周计划第一组前 26 词
      for (var i = 0; i < 8; i++)                 // 8 个连对 5 次 → 自动掌握
        for (var n = 0; n < 5; n++) TW.store.markRight(words[i].id);
      for (var i = 8; i < 20; i++) {              // 12 个学过未掌握
        TW.store.markRight(words[i].id);
        TW.store.markRight(words[i].id);
        TW.store.srs.onResult(words[i].word, true, 'week1', '');   // 升档 → 明天到期（排期条有数据）
      }
      for (var j = 20; j < 26; j++) {             // 6 个答错 → 今日到期进复习队列
        TW.store.markWrong(words[j].id);
        TW.store.srs.onResult(words[j].word, false, 'week1', '');
      }
      var days = %s;
      // 手工铺近 10 天练习量（含今天，本地日期）
      var d = new Date();
      for (var k = 0; k < days.length; k++) {
        var dd = new Date(); dd.setDate(dd.getDate() - (days.length - 1 - k));
        TW.store.state.daily[localKey(dd)] = { done: days[k][0], right: days[k][1] };
      }
      TW.store.save();
      return { first: words[0].word, fid: words[0].id,
               inc: (TW.WORDS.find(x => x.word === 'increase') || words[0]).id };
    }""" % str(DEMO_DAILY))
    print("seeded:", seeded)
    pg.wait_for_timeout(500)   # 🔴 save() 是 120ms 防抖，立刻 reload 会丢数据
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(1200)

    def shot(hash_url, name, wait=900, dismiss_srs=False):
        pg.goto(BASE + hash_url, wait_until="domcontentloaded")
        pg.wait_for_timeout(wait)
        if dismiss_srs:
            # 有到期复习时练习页先弹「先复习」插层，点掉直接进学新词主界面
            btn = pg.locator("text=今天不再提醒")
            if btn.count():
                btn.first.click()
                pg.wait_for_timeout(1200)
        pg.screenshot(path=str(OUT / name))
        print("shot:", name)

    shot("#/", "preview-home.png", 1500)
    shot("#/books", "preview-decks.png", 1200)
    shot("#/practice?book=week1&mode=type", "preview-practice.png", 1500, dismiss_srs=True)
    shot("#/srs", "preview-srs.png", 1000)
    shot("#/word?id=" + str(seeded["fid"]), "preview-word.png", 2500)
    shot("#/sentences", "preview-sentences.png", 1500)

    print("console errors:", errors[:5])
    b.close()

import os
os._exit(0)   # 🔴 b.close() 后进程会挂死，直接硬退（截图已落盘）
