#!/usr/bin/env python3
"""Sync chat assets between app/static/ and pages/assets/ (pure HTML/CSS/JS)."""
import argparse
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAIRS = [
    (ROOT / "app/static/style.css", ROOT / "pages/assets/chat.css"),
    (ROOT / "app/static/script.js", ROOT / "pages/assets/chat.js"),
    (ROOT / "app/static/favicon.svg", ROOT / "pages/assets/favicon.svg"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync chat assets to pages/assets/")
    parser.add_argument("--check", action="store_true", help="Verify assets are in sync")
    args = parser.parse_args()

    if args.check:
        out_of_sync = []
        for src, dst in PAIRS:
            if not dst.exists() or not filecmp.cmp(src, dst, shallow=False):
                out_of_sync.append((src.relative_to(ROOT), dst.relative_to(ROOT)))
        if out_of_sync:
            for s, d in out_of_sync:
                print(f"OUT OF SYNC: {s} != {d}", file=sys.stderr)
            return 1
        print("All chat assets are in sync.")
        return 0

    for src, dst in PAIRS:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    print("Synced pure HTML/CSS/JS chat assets to pages/assets/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
