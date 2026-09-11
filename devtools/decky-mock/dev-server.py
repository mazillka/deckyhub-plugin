"""Local dev bridge for DeckyHub's UI mock: exposes main.py's Plugin over HTTP.

Fakes just enough of the `decky` module (paths, a no-op logger) so main.py's
Plugin class can run outside the real Decky Loader, then serves POST /
{"route": "get_apps", "args": []} -> {"ok": true, "result": ...}, calling the
real Plugin method on a persistent background event loop. Stdlib only, no
extra pip installs, matching the rest of this project's backend.

Run from the repo root: python devtools/decky-mock/dev-server.py
"""

import asyncio
import json
import sys
import threading
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MOCK_DIR = Path(__file__).resolve().parent
REPO_ROOT = MOCK_DIR.parent.parent
DEV_DATA = MOCK_DIR / ".dev-data"
(DEV_DATA / "settings").mkdir(parents=True, exist_ok=True)
(DEV_DATA / "plugins").mkdir(parents=True, exist_ok=True)

fake_decky = types.ModuleType("decky")
fake_decky.DECKY_PLUGIN_SETTINGS_DIR = str(DEV_DATA / "settings")
fake_decky.DECKY_PLUGIN_DIR = str(REPO_ROOT)
fake_decky.DECKY_HOME = str(DEV_DATA)
fake_decky.logger = types.SimpleNamespace(info=print, warning=print, error=print, debug=lambda *a, **k: None)
sys.modules["decky"] = fake_decky

sys.path.insert(0, str(REPO_ROOT))
from main import Plugin  # noqa: E402

loop = asyncio.new_event_loop()
plugin = Plugin()


def _run_loop():
    asyncio.set_event_loop(loop)
    loop.run_forever()


threading.Thread(target=_run_loop, daemon=True, name="decky-mock-loop").start()
asyncio.run_coroutine_threadsafe(plugin._main(), loop).result()
print(f"[decky-mock] Plugin ready. Fake DECKY_HOME: {fake_decky.DECKY_HOME}")


def call_route(route: str, args: list):
    method = getattr(plugin, route, None)
    if method is None or not callable(method) or route.startswith("_"):
        raise ValueError(f"Unknown route: {route}")
    return asyncio.run_coroutine_threadsafe(method(*args), loop).result(timeout=30)


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length) or b"{}")
        try:
            result = call_route(payload["route"], payload.get("args", []))
            body = json.dumps({"ok": True, "result": result}).encode("utf-8")
            status = 200
        except Exception as error:  # dev tool: surface any backend error straight to the browser
            body = json.dumps({"ok": False, "error": str(error)}).encode("utf-8")
            status = 500
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002 - matches BaseHTTPRequestHandler's signature
        pass


if __name__ == "__main__":
    port = 8642
    print(f"[decky-mock] Backend bridge listening on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
