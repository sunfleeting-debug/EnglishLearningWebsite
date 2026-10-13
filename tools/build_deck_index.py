# -*- coding: utf-8 -*-
"""生成 data/deck-index.js：12 本词典的全量「词面 → 词典」索引（不含释义）。

为什么需要它：词典词条是按需加载的（每本 100~450KB），首页搜索只搜「周计划 +
已加载的词典」——像 deceptive（在 gre/toefl 里）这种没加载过的词典词就搜不到了。
有了索引（约 500KB，同样按需加载），搜索兜底时能直接告诉用户「这个词在哪本词典」，
点击进详解时再加载那一本（详解页本来就有 loadBook 逻辑，word.js id=deck:word）。

用法：
    python tools/build_deck_index.py
"""
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DICTS = ROOT / "data" / "dicts"
OUT = ROOT / "data" / "deck-index.js"

ROW = re.compile(r'\["([^"]+)"')


def main():
    index = {}
    total = 0
    for f in sorted(DICTS.glob("*.js")):
        if f.name in ("index.js",):
            continue
        text = io.open(f, encoding="utf-8").read()
        m = re.search(r'window\.TW\.DECKS\["([a-z0-9]+)"\]=', text)
        if not m:
            print("跳过（无 DECKS 赋值）:", f.name)
            continue
        deck_id = m.group(1)
        # 每个 ["word",...] 行首截出单词（文件是紧凑 JSON 行数组，词面是每行数组第一项；
        # 直接对所有 ["..."] 匹配会误伤释义串——释义在数组第 4 位且含逗号/引号转义，
        # 用「数组开头 = 前面是 [= 或 ],」的上下文判断）
        words = []
        for mt in ROW.finditer(text):
            start = mt.start()
            prev = text[max(0, start - 2):start]      # 应为 "=（首行）或 ],（后续行）
            if prev not in ("=", "],"):
                continue
            w = mt.group(1)
            if w and w not in words:
                words.append(w)
        if not words:
            print("警告：提取到 0 词:", f.name)
            continue
        index[deck_id] = words
        total += len(words)
        print("%-12s %5d 词" % (deck_id, len(words)))

    body = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    out = ("/* 自动生成，请勿手动修改；来源 data/dicts/*.js 的词面索引（不含释义，"
           "由 tools/build_deck_index.py 生成） */\n"
           "window.TW=window.TW||{};window.TW.DECK_INDEX=" + body + ";")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(out)
    print("共 %d 本词典 %d 词 → %s (%.0f KB)"
          % (len(index), total, OUT.relative_to(ROOT), OUT.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
