import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_pages_exist():
    for rel in (
        "pages/index.html",
        "pages/about/index.html",
        "pages/how-it-works/index.html",
        "pages/privacy/index.html",
        "pages/api/index.html",
        "pages/api-docs/index.html",
        "pages/chat/index.html",
        "pages/404.html",
        "pages/assets/status.json",
    ):
        assert (ROOT / rel).is_file(), f"missing {rel}"


def test_pages_chat_in_sync():
    r = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "sync_chat.py"), "--check"],
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr
