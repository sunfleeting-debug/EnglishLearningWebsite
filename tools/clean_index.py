# -*- coding: utf-8 -*-
"""清理 index.html 上被外部工具注入的 data-page-node-id 属性。

背景：本机预览面板 / 编辑器打开 index.html 后会往里塞 `data-page-node-id="..."`，
导致每次 `git status` 都显示 index.html 被修改，一不留神就把噪声提交上去。
本项目完全不需要这些属性，直接删掉。

用法：
    python tools/clean_index.py           # 清理并报告清理了多少处
    python tools/clean_index.py --check   # 只检查（有残留则退出码 1，便于接入 CI/提交流程）
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "index.html"

# 只匹配该属性本身（含前面的空白），不会触碰其它内容
PATTERN = re.compile(r'\s+data-page-node-id="[^"]*"')


def main():
    text = TARGET.read_text(encoding="utf-8")
    hits = len(PATTERN.findall(text))

    if "--check" in sys.argv:
        if hits:
            print("index.html 残留 %d 处 data-page-node-id（运行 python tools/clean_index.py 清理）" % hits)
            sys.exit(1)
        print("index.html 干净：无 data-page-node-id")
        return

    if not hits:
        print("index.html 干净：无需清理")
        return
    TARGET.write_text(PATTERN.sub("", text), encoding="utf-8")
    print("已从 index.html 清理 %d 处 data-page-node-id" % hits)


if __name__ == "__main__":
    main()
