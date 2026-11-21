#!/usr/bin/env python3
"""Download the complete Apple emoji PNG set from emoji-datasource-apple into app/static/emojis/apple/."""
import io
import json
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DST = ROOT / "app" / "static" / "emojis" / "apple"
PAGES_DST = ROOT / "pages" / "assets" / "emojis" / "apple"
META_URL = "https://registry.npmjs.org/emoji-datasource-apple/latest"


def main() -> int:
    print(f"Fetching package metadata from {META_URL} ...")
    with urllib.request.urlopen(META_URL, timeout=30) as resp:
        meta = json.loads(resp.read().decode("utf-8"))

    tarball_url = meta["dist"]["tarball"]
    version = meta.get("version", "latest")
    print(f"Downloading emoji-datasource-apple@{version} ({tarball_url}) ...")

    with urllib.request.urlopen(tarball_url, timeout=180) as resp:
        data = resp.read()

    APP_DST.mkdir(parents=True, exist_ok=True)
    PAGES_DST.mkdir(parents=True, exist_ok=True)

    count = 0
    prefix = "package/img/apple/64/"
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        for member in tf.getmembers():
            if not member.isfile() or not member.name.startswith(prefix) or not member.name.endswith(".png"):
                continue
            fname = Path(member.name).name.lower()
            raw = tf.extractfile(member).read()
            (APP_DST / fname).write_bytes(raw)
            (PAGES_DST / fname).write_bytes(raw)
            count += 1

    print(f"Done! Extracted {count} Apple emoji PNGs into:")
    print(f"  - {APP_DST}")
    print(f"  - {PAGES_DST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
