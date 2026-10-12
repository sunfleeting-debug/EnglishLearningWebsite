# -*- coding: utf-8 -*-
"""本地静态服务器：在标准 http.server 基础上补上 Range 请求支持。

为什么需要它：
    Python 自带的 `python -m http.server` 会忽略 Range 请求头、返回整份文件（HTTP 200），
    因此浏览器无法对 mp3 做「拖动进度 / 按时间跳转」——音频跟读页点击单词会跳转失败。
    本脚本实现了单段 Range（HTTP 206），与 GitHub Pages 的行为一致。

用法：
    python tools/serve.py                # 默认 127.0.0.1:5173
    python tools/serve.py -p 8080
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(SimpleHTTPRequestHandler):
    """支持单段 Range 的静态文件处理器。"""

    protocol_version = "HTTP/1.1"   # 支持 keep-alive，也对 Range 必需

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        m = RANGE_RE.fullmatch(rng.strip())
        if not m:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return None

        size = os.path.getsize(path)
        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":
            # bytes=-N 表示最后 N 字节
            n = int(end_s or 0)
            start = max(0, size - n)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
        end = min(end, size - 1)

        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        f = open(path, "rb")
        f.seek(start)
        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(length))
        self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
        self.end_headers()
        self._range_len = length
        return f

    def copyfile(self, source, outputfile):
        """发送时按 Range 长度截断，避免多写。"""
        limit = getattr(self, "_range_len", None)
        if limit is None:
            return super().copyfile(source, outputfile)
        remaining = limit
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith(("GET", "HEAD")):
            sys.stderr.write("  %s\n" % (fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--port", type=int, default=5173)
    ap.add_argument("-b", "--bind", default="127.0.0.1", help="默认只监听本机，避免被误当分享")
    ap.add_argument("-d", "--dir", default=None, help="站点根目录，默认仓库根")
    args = ap.parse_args()

    root = args.dir or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = partial(RangeHandler, directory=root)
    srv = ThreadingHTTPServer((args.bind, args.port), handler)
    print("静态服务器已启动： http://%s:%d/   （根目录 %s）" % (args.bind, args.port, root))
    print("支持 Range 请求，音频可拖动进度 / 点击字幕跳转。Ctrl+C 停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
