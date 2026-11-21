#!/usr/bin/env bash
set -euo pipefail

STATUS="${1:?status required}"
URL="${2:-}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ -n "${PUBLIC_API_KEY:-}" ]; then
  echo -n "$PUBLIC_API_KEY" > "$ROOT/.public_api_key"
elif [ -f "$ROOT/.public_api_key" ]; then
  PUBLIC_API_KEY="$(cat "$ROOT/.public_api_key")"
else
  PUBLIC_API_KEY="$(python3 -c 'import secrets; print("sk-uc-" + secrets.token_hex(16))')"
  echo -n "$PUBLIC_API_KEY" > "$ROOT/.public_api_key"
fi
export PUBLIC_API_KEY

OLD_RUN=0
OLD_STATUS=""
OLD_URL=""
OLD_KEY=""
if git ls-remote --exit-code --heads "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" gh-pages > /dev/null 2>&1; then
    cd "$OUT"
    git init -q
    git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
    git fetch -q --depth 1 origin gh-pages
    git checkout -q -b gh-pages origin/gh-pages
    if [ -f "assets/status.json" ]; then
        OLD_RUN=$(python3 -c "import json; print(json.load(open('assets/status.json')).get('run_number', 0))" 2>/dev/null || echo "0")
        OLD_STATUS=$(python3 -c "import json; print(json.load(open('assets/status.json')).get('status', ''))" 2>/dev/null || echo "")
        OLD_URL=$(python3 -c "import json,base64; p=json.load(open('assets/status.json')).get('url_payload') or ''; print(base64.b64decode(p).decode() if p else '')" 2>/dev/null || echo "")
        OLD_KEY=$(python3 -c "import json; print(json.load(open('assets/status.json')).get('public_api_key', ''))" 2>/dev/null || echo "")
    fi
    find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
else
    cd "$OUT"
    git init -q
    git checkout -q -b gh-pages
fi

CURRENT_RUN="${GITHUB_RUN_NUMBER:-0}"
if [ "$CURRENT_RUN" -lt "$OLD_RUN" ]; then
    echo "Current run ($CURRENT_RUN) is older than published run ($OLD_RUN). Aborting."
    exit 0
fi

if [ "$STATUS" = "offline" ] && [ "$CURRENT_RUN" -ne "$OLD_RUN" ] && [ "$OLD_RUN" != "0" ]; then
    echo "Published link belongs to run $OLD_RUN, not $CURRENT_RUN; leaving it alone."
    exit 0
fi

# Zero-downtime handoff: always publish updated pages/ HTML/CSS/JS immediately
# while preserving the active run's online tunnel URL until the new tunnel is ready!
PUBLISH_RUN="$CURRENT_RUN"
if [ "$STATUS" = "starting" ] && [ "$OLD_STATUS" = "online" ] && [ -n "$OLD_URL" ] && [ "$CURRENT_RUN" -gt "$OLD_RUN" ]; then
    echo "Run $OLD_RUN is still online; updating site HTML/JS while keeping run $OLD_RUN's live link ($OLD_URL)."
    STATUS="online"
    URL="$OLD_URL"
    PUBLISH_RUN="$OLD_RUN"
    [ -n "$OLD_KEY" ] && PUBLIC_API_KEY="$OLD_KEY"
fi

python3 "$ROOT/scripts/sync_chat.py" >/dev/null || echo "::warning::sync_chat.py failed; publishing committed copy"
cp -R "$ROOT/pages/." .
touch .nojekyll

OWNER="${GITHUB_REPOSITORY%%/*}"; REPO_NAME="${GITHUB_REPOSITORY#*/}"
if [ -z "${PAGES_BASE:-}" ]; then
  if [ -f CNAME ] || [ "${REPO_NAME,,}" = "${OWNER,,}.github.io" ]; then PAGES_BASE="/"; else PAGES_BASE="/${REPO_NAME}/"; fi
fi
[ -f 404.html ] && sed -i "s#__PAGES_BASE__#${PAGES_BASE}#" 404.html
mkdir -p assets api

python3 - "assets/status.json" "api/links.json" "api/links.txt" "$STATUS" "$URL" "$PUBLIC_API_KEY" "$PUBLISH_RUN" <<'PY'
import base64, datetime, json, os, sys
status_path, links_path, txt_path, status, url, pub_key, pub_run = sys.argv[1:8]
server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
repo = os.environ["GITHUB_REPOSITORY"]
run_id = os.environ.get("GITHUB_RUN_ID", "")
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
run_url = f"{server}/{repo}/actions/runs/{run_id}" if run_id else None
run_number = int(pub_run or os.environ.get("GITHUB_RUN_NUMBER", 0))
commit = os.environ.get("GITHUB_SHA", "")[:7]
url = (url or "").rstrip("/")

routes = {
    "openai_base_url": f"{url}/v1" if url else None,
    "chat_completions": f"{url}/v1/chat/completions" if url else None,
    "v1_chat_completions": f"{url}/api/v1/chat/completions" if url else None,
    "models": f"{url}/v1/models" if url else None,
    "native_chat": f"{url}/api/v1/chat" if url else None,
    "native_stream": f"{url}/api/v1/chat/stream" if url else None,
    "key": f"{url}/api/v1/key" if url else None,
    "health": f"{url}/api/v1/health" if url else None,
}

with open(status_path, "w", encoding="utf-8") as f:
    json.dump({
        "status": status,
        "url_payload": base64.b64encode(url.encode()).decode() if url else None,
        "public_api_key": pub_key,
        "api_key": pub_key,
        "model": "یونیکالکت چت مینی",
        "model_id": "unicollect-chat-mini",
        "creator": "Muvixo",
        "routes": routes,
        "updated_at": now, "run_url": run_url, "run_number": run_number, "commit": commit,
    }, f, ensure_ascii=False, indent=2)

endpoints = [
    ("GET", "/api/v1/key"),
    ("POST", "/v1/chat/completions"),
    ("GET", "/v1/models"),
    ("POST", "/api/v1/chat"),
    ("POST", "/api/v1/chat/stream"),
    ("POST", "/api/v1/chat/completions"),
    ("POST", "/api/v1/generate"),
    ("GET", "/api/v1"),
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/ready"),
    ("GET", "/api/v1/info"),
    ("GET", "/api/v1/models"),
    ("GET", "/api/v1/config"),
    ("GET", "/api/v1/stats"),
    ("GET", "/health"),
]
online = bool(url) and status == "online"
links = {
    "service": "unicollect",
    "model": "یونیکالکت چت مینی",
    "model_id": "unicollect-chat-mini",
    "creator": "Muvixo",
    "public_api_key": pub_key,
    "api_key": pub_key,
    "status": status,
    "online": online,
    "base_url": url or None,
    "routes": routes,
    "links": {
        "panel": url or None,
        "openai_base": f"{url}/v1" if url else None,
        "chat_completions": f"{url}/v1/chat/completions" if url else None,
        "api": f"{url}/api/v1" if url else None,
        "key": f"{url}/api/v1/key" if url else None,
        "health": f"{url}/api/v1/health" if url else None,
        "swagger": f"{url}/docs" if url else None,
        "redoc": f"{url}/redoc" if url else None,
        "openapi": f"{url}/openapi.json" if url else None,
        "guide": f"{url}/api-docs" if url else None,
        "public_key_page": f"{url}/site/public-key/" if url else None,
    },
    "endpoints": [{"method": m, "path": p, "url": (url + p) if url else None} for m, p in endpoints],
    "updated_at": now, "run_url": run_url, "run_number": run_number, "commit": commit,
}
with open(links_path, "w", encoding="utf-8") as f:
    json.dump(links, f, ensure_ascii=False, indent=2)
with open(txt_path, "w", encoding="utf-8") as f:
    f.write((url or "offline") + "\n")
PY

cp -f "api/links.json" "api-docs/links.json" 2>/dev/null || true
cp -f "api/links.txt" "api-docs/links.txt" 2>/dev/null || true

git add -A
if git diff --cached --quiet; then
    echo "Status unchanged; nothing to publish."
    exit 0
fi
git -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -q -m "status: ${STATUS} ${URL}"

for attempt in 1 2 3; do
    if git push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" gh-pages; then
        echo "Published '${STATUS}' ${URL} (KEY: ${PUBLIC_API_KEY}) to gh-pages (Run $PUBLISH_RUN)"
        exit 0
    fi
    if [ "$attempt" -ge 2 ]; then
        if git push -q --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" gh-pages; then
            echo "Published '${STATUS}' ${URL} (KEY: ${PUBLIC_API_KEY}) to gh-pages via force-push (Run $PUBLISH_RUN)"
            exit 0
        fi
    fi
    sleep $((attempt * 3))
done
echo "::warning::Could not push status page to gh-pages"
exit 1