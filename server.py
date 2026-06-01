#!/usr/bin/env python3
"""轻量 HTTP 服务，自动打开浏览器，端口冲突时自动+1"""
import http.server
import socketserver
import os
import sys
import socket
import subprocess

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        if "/@vite/" in str(args):
            return
        super().log_message(fmt, *args)


def find_free_port(start):
    for p in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return None


if __name__ == "__main__":
    os.chdir(DIR)
    port = find_free_port(PORT)
    if port is None:
        print("错误：找不到可用端口")
        sys.exit(1)

    with socketserver.TCPServer(("", port), Handler) as httpd:
        url = f"http://localhost:{port}"
        print(f"\n  ✅ 服务已启动: {url}")
        print()
        try:
            subprocess.Popen(["cmd", "/c", "start", url], shell=True)
        except Exception:
            pass
        print("  按 Ctrl+C 停止服务\n")
        httpd.serve_forever()
