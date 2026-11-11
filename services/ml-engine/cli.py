from __future__ import annotations

import json
import sys
from ml_core.engine import dispatch_ml_task


def main() -> int:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
        task = data.get("task")
        payload = data.get("payload", {})
        if not task:
            print(json.dumps({"error": "Missing 'task' field."}))
            return 1
        result = dispatch_ml_task(str(task), payload)
        print(json.dumps(result))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
