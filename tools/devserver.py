"""Static dev server for the G-Code repo with caching disabled."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5190
root = Path(__file__).resolve().parents[1]
ThreadingHTTPServer(("127.0.0.1", port), partial(NoCache, directory=str(root))).serve_forever()
