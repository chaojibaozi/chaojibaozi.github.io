#!/usr/bin/env python3
"""HTTP server with COOP/COEP headers needed for SharedArrayBuffer (ONNX runtime)."""
import http.server
import socketserver
import os
import mimetypes

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/octet-stream", ".onnx")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Required for SharedArrayBuffer support in ONNX runtime
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Allow CDN resources
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def guess_type(self, path):
        mime = mimetypes.guess_type(path)[0]
        if path.endswith(".onnx"):
            return "application/octet-stream"
        if path.endswith(".wasm"):
            return "application/wasm"
        return mime or "application/octet-stream"

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving at http://localhost:{PORT} with COOP/COEP headers")
        httpd.serve_forever()
