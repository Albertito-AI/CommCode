import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


def greeting(name="community"):
    return {"message": f"Hello, {name}", "project": "Your portable Python API"}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        payload = json.dumps(greeting()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    HTTPServer((os.getenv("HOST", "0.0.0.0"), int(os.getenv("PORT", "8080"))), Handler).serve_forever()
