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
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class ThreadingServer(ThreadingHTTPServer):
    """守护线程模式 + 网络中断静默处理。"""
    daemon_threads = True

    def handle_error(self, request, client_address):
        # 关闭页面、拖动音频进度都会让浏览器在 keep-alive 连接上突然断开。
        # socketserver 默认会打印整段 traceback，把日志淹没、掩盖真正的问题；
        # 这类异常属正常现象，静默忽略。
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


class RangeHandler(SimpleHTTPRequestHandler):
    """支持单段 Range 的静态文件处理器。"""

    protocol_version = "HTTP/1.1"   # 支持 keep-alive，也对 Range 必需

    def send_head(self):
        # 🔴 每次请求入口都必须清空 Range 长度。
        #    HTTP/1.1 keep-alive 会让同一个 handler 实例连续处理多个请求，
        #    而 self._range_len 是实例属性：若不在入口重置，上一次 Range 请求
        #    （如 mp3 拖动）的长度会残留到下一次普通请求（如 4MB 的 dict.js），
        #    导致文件被「静默截断」——响应仍是 200，但内容不完整，脚本解析失败。
        self._range_len = None

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
        """发送时按 Range 长度截断，避免多写；客户端主动断开视为正常。"""
        limit = getattr(self, "_range_len", None)
        try:
            if limit is None:
                return super().copyfile(source, outputfile)
            remaining = limit
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # 拖动音频进度、提前关闭页面都会让客户端主动断开连接，属正常现象，
            # 不应打印 traceback（否则日志被噪声淹没，掩盖真正的问题）。
            pass

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

    # 端口占用自检：Windows 下 SO_REUSEADDR 允许两个进程绑同一端口而不报错，
    # 于是会出现「新服务其实没起来、旧进程继续响应」的假象（调试时曾遇到 4 个进程叠加，
    # 造成 4MB 的 dict.js 时好时坏）。这里主动连一次，明确失败，避免静默错乱。
    probe = socket.socket()
    probe.settimeout(0.3)
    try:
        busy = probe.connect_ex((args.bind, args.port)) == 0
    finally:
        probe.close()
    if busy:
        sys.stderr.write(
            "端口 %d 已被占用，请先结束占用进程：\n"
            "  netstat -ano | findstr :%d\n"
            "  再用 taskkill /PID <pid> /F 结束它\n" % (args.port, args.port))
        sys.exit(1)

    handler = partial(RangeHandler, directory=root)
    srv = ThreadingServer((args.bind, args.port), handler)
    print("静态服务器已启动： http://%s:%d/   （根目录 %s）" % (args.bind, args.port, root))
    print("支持 Range 请求，音频可拖动进度 / 点击字幕跳转。Ctrl+C 停止。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
