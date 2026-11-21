#!/usr/bin/env python3
"""Smoke test against a running Ollama Web Panel server."""
import sys
import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")


def main():
    r = requests.get(f"{BASE}/health", timeout=10)
    assert r.status_code == 200, f"/health returned {r.status_code}"
    h = r.json()
    assert h.get("status") == "ok", f"/health not ok: {h}"

    r = requests.get(f"{BASE}/api/v1", timeout=10)
    assert r.status_code == 200, f"/api/v1 returned {r.status_code}"

    r = requests.get(f"{BASE}/site/", timeout=10)
    assert r.status_code == 200, f"/site/ returned {r.status_code}"

    print(f"Smoke tests passed for {BASE} (model={h.get('model')})")


if __name__ == "__main__":
    main()
