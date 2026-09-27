#!/usr/bin/env python3
"""
Minimal stdlib HTTP adapter server. Demonstrates the "http" protocol:
a tool that's already a long-running local process instead of a
per-call spawned one. Run this, then agentsamd POSTs to it per tool.json's url.
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            req = json.loads(body) if body else {}
            text = req.get("arguments", {}).get("text", "")
            out = {"ok": True, "result": {"text": text, "via": "http"}}
        except Exception as e:
            out = {"ok": False, "error": f"bad json: {e}"}
        payload = json.dumps(out).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass  # quiet; agentsamd's own logs are the source of truth


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8901), Handler).serve_forever()
