# -*- coding: utf-8 -*-
"""把 data/*.json 包装成全局变量形式的 *.js，使网站无需 HTTP 服务器也能直接打开。

产出：
    data/words.js  ->  window.TW.WORDS = [...]
    data/books.js  ->  window.TW.BOOKS = [...]
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def wrap(json_name: str, js_name: str, var_path: str):
    with open(os.path.join(DATA, json_name), "r", encoding="utf-8") as f:
        obj = json.load(f)
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    text = "/* 自动生成，请勿手动修改；来源 %s */\nwindow.TW=window.TW||{};%s=%s;\n" % (json_name, var_path, payload)
    with open(os.path.join(DATA, js_name), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("[ok] %s -> %s (%.0f KB)" % (json_name, js_name, len(text.encode("utf-8")) / 1024))


if __name__ == "__main__":
    wrap("words.json", "words.js", "window.TW.WORDS")
    wrap("books.json", "books.js", "window.TW.BOOKS")
