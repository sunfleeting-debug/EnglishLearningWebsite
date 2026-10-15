# -*- coding: utf-8 -*-
"""把 data/dict.js（4MB 词典卡）与 data/dict-ext.js（1MB 扩展词条）按首字母拆成小块。

背景：2026-10-15 sunfleeting 反馈详解页「加载词典太慢」——整本 dict.js 4MB 在慢网下
要 96s+。实际上详解页一次只需要当前词那一块（~几十到几百 KB），按字母拆成
data/dict/<a-z0->.js 与 data/dict-ext/<a-z0->.js，data.js 按需注入。

拆分规则：键的首个字母/数字定块（跳过前导非字母数字；无则进 '0' 块）。
原 data/dict.js / dict-ext.js 保留不删（回退/再生成源）。
用法：python tools/build_dict_letters.py
"""
import json, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

JOBS = [
    ("data/dict.js", "window.TW.DICT=", "data/dict", "DICT",
     "词典卡分块（来源 dict.json，有道词典 + Datamuse）"),
    ("data/dict-ext.js", "window.TW.DICT_EXT=", "data/dict-ext", "DICT_EXT",
     "扩展词条分块（来源 dict-ext.json，有道词典）"),
]

HEADER = ("/* 自动生成，请勿手动修改；生成器 tools/build_dict_letters.py。%s */\n"
          "window.TW=window.TW||{};window.TW.%s=window.TW.%s||{};\n")


def bucket(key):
    s = str(key).lower()
    i = 0
    while i < len(s) and not ('a' <= s[i] <= 'z' or '0' <= s[i] <= '9'):
        i += 1
    c = s[i] if i < len(s) else '0'
    return c if ('a' <= c <= 'z' or '0' <= c <= '9') else '0'


def main():
    for src, marker, outdir, target, note in JOBS:
        s = (ROOT / src).read_text(encoding="utf-8")
        data = json.loads(s.split(marker, 1)[1].rstrip().rstrip(';'))
        groups = {}
        for k, v in data.items():
            groups.setdefault(bucket(k), {})[k] = v
        os.makedirs(ROOT / outdir, exist_ok=True)
        total = 0
        for letter in sorted(groups):
            payload = json.dumps(groups[letter], ensure_ascii=False,
                                 separators=(",", ":"))
            js = (HEADER % (note, target, target) +
                  "window.TW.DICT_PART=window.TW.DICT_PART||{};\n"
                  "window.TW.DICT_PART['%s']=%s;\n"
                  "Object.assign(window.TW.%s,window.TW.DICT_PART['%s']);\n"
                  % (letter, payload, target, letter))
            out = ROOT / outdir / (letter + ".js")
            out.write_text(js, encoding="utf-8", newline="\n")
            total += out.stat().st_size
        print("%s -> %s/  %d 块，共 %d 字节（原 %d）"
              % (src, outdir, len(groups), total, (ROOT / src).stat().st_size))


if __name__ == "__main__":
    main()
