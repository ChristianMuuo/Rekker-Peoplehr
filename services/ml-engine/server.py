from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ml_core.engine import TASK_HANDLERS, dispatch_ml_task


class MlRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, body: dict) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            self._send_json(
                200,
                {
                    "status": "ok",
                    "service": "rekker-peopleos-ml",
                    "models": list(TASK_HANDLERS.keys()),
                },
            )
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self.path.startswith("/predict/"):
            self._send_json(404, {"error": "Unknown ML endpoint"})
            return
        task = self.path.replace("/predict/", "", 1).strip("/")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw.decode("utf-8"))
            result = dispatch_ml_task(task, payload)
            self._send_json(200, result)
        except ValueError as err:
            self._send_json(400, {"error": str(err)})
        except Exception as exc:  # noqa: BLE001
            self._send_json(500, {"error": f"ML inference failure: {exc}"})

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return


def main() -> None:
    port = int(os.environ.get("ML_PORT", "8001"))
    server = ThreadingHTTPServer(("127.0.0.1", port), MlRequestHandler)
    print(f"Rekker PeopleOS Python ML Engine listening on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

