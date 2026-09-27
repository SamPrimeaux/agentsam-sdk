#!/usr/bin/env python3
"""stdio-json adapter, stdlib only. See ../../ADAPTER_CONTRACT.md."""
import sys
import json


def main():
    line = sys.stdin.readline()
    try:
        req = json.loads(line) if line.strip() else {}
        text = req.get("arguments", {}).get("text", "")
        print(json.dumps({"ok": True, "result": {"text": text, "via": "python"}}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"bad json: {e}"}))


if __name__ == "__main__":
    main()
