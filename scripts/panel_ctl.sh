#!/usr/bin/env bash
# Ollama Web Panel service control, used by .github/workflows/deploy.yml.
#
#   panel_ctl.sh retry N CMD...     run CMD up to N times with growing back-off
#   panel_ctl.sh start              start gunicorn in the background (server.log)
#   panel_ctl.sh stop               stop gunicorn
#   panel_ctl.sh wait-healthy [S]   wait up to S seconds (default 180) for /health = ok
#   panel_ctl.sh boot [TRIES]       start + wait, restarting up to TRIES times (default 3)
#   panel_ctl.sh health             print local /health JSON (empty on failure)
#   panel_ctl.sh ok                 exit 0 if /health reports "status":"ok"
#   panel_ctl.sh tunnel             (re)start the Cloudflare quick tunnel, print its URL
#   panel_ctl.sh published-run      print "<run_number> <status>" from gh-pages status.json
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8000}"
LOCAL="http://127.0.0.1:${PORT}"

log() { echo "[panel_ctl] $*"; }

retry() {
  local n="$1"; shift
  local i
  for i in $(seq 1 "$n"); do
    if "$@"; then return 0; fi
    if [ "$i" -lt "$n" ]; then
      log "attempt ${i}/${n} failed: $*; retrying in $((i * 15))s"
      sleep $((i * 15))
    fi
  done
  log "giving up after ${n} attempts: $*"
  return 1
}

health() { curl -fs --max-time 10 "${LOCAL}/health" 2>/dev/null || true; }

is_ok() { health | grep -q '"status":"ok"'; }

start() {
  if pgrep -f "gunicorn app.main:app" >/dev/null; then log "gunicorn already running"; return 0; fi
  log "starting gunicorn"
  env -u RUNNER_TRACKING_ID setsid bash scripts/start_server.sh < /dev/null >> server.log 2>&1 &
  sleep 2
}

stop() {
  pkill -TERM -f "gunicorn app.main:app" 2>/dev/null || true
  for _ in $(seq 1 20); do pgrep -f "gunicorn app.main:app" >/dev/null || return 0; sleep 1; done
  pkill -KILL -f "gunicorn app.main:app" 2>/dev/null || true
}

wait_healthy() {
  local limit="${1:-180}" waited=0 st=""
  while [ "$waited" -lt "$limit" ]; do
    st="$(health)"
    if echo "$st" | grep -q '"status":"ok"'; then log "healthy after ~${waited}s: $st"; return 0; fi
    if ! pgrep -f "gunicorn app.main:app" >/dev/null; then log "gunicorn exited while starting"; break; fi
    if [ $((waited % 15)) -eq 0 ]; then log "waiting (${waited}s) ${st}"; fi
    sleep 3; waited=$((waited + 3))
  done
  log "not healthy after ${waited}s"
  tail -n 60 server.log 2>/dev/null || true
  return 1
}

boot() {
  local tries="${1:-3}" i
  for i in $(seq 1 "$tries"); do
    start
    if wait_healthy 180; then return 0; fi
    log "boot attempt ${i}/${tries} failed, restarting server"
    stop
    sleep $((i * 5))
  done
  return 1
}

tunnel() {
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  sleep 1
  : > tunnel.log
  # Use HTTP/2 over TCP/443 + IPv4 + 127.0.0.1 + setsid/</dev/null to prevent Error 1033 on GitHub Actions runners
  env -u RUNNER_TRACKING_ID setsid ./cloudflared tunnel --url "${LOCAL}" --protocol http2 --edge-ip-version 4 --no-autoupdate < /dev/null > tunnel.log 2>&1 &
  local url="" i ready=0
  for i in $(seq 1 45); do
    if ! pgrep -f "cloudflared tunnel" >/dev/null; then
      log "cloudflared exited early" >&2
      tail -n 40 tunnel.log >&2
      return 1
    fi
    url="$(grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" tunnel.log | head -n1 || true)"
    [ -n "$url" ] && break
    sleep 2
  done
  if [ -z "$url" ]; then log "no tunnel URL" >&2; tail -n 40 tunnel.log >&2; return 1; fi
  # Strictly verify the public tunnel returns HTTP 200 on /health (never publish a broken Error 1033 URL!)
  for i in $(seq 1 25); do
    if curl -fs --max-time 10 "${url}/health" 2>/dev/null | grep -q '"status":"ok"'; then
      ready=1
      break
    fi
    sleep 3
  done
  if [ "$ready" != "1" ]; then
    log "tunnel URL ${url} failed /health check (possible Error 1033); restarting..." >&2
    tail -n 30 tunnel.log >&2
    pkill -f "cloudflared tunnel" 2>/dev/null || true
    return 1
  fi
  echo "$url"
}

published_run() {
  : "${GITHUB_REPOSITORY:?}"
  local raw
  raw="$(gh api "repos/${GITHUB_REPOSITORY}/contents/assets/status.json?ref=gh-pages" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || true)"
  [ -z "$raw" ] && { echo "0 unknown"; return 0; }
  python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(int(d.get("run_number") or 0), d.get("status") or "unknown")' "$raw" 2>/dev/null || echo "0 unknown"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  retry) retry "$@" ;;
  start) start ;;
  stop) stop ;;
  wait-healthy) wait_healthy "${1:-180}" ;;
  boot) boot "${1:-3}" ;;
  health) health; echo ;;
  ok) is_ok ;;
  tunnel) tunnel ;;
  published-run) published_run ;;
  *) echo "usage: $0 {retry|start|stop|wait-healthy|boot|health|ok|tunnel|published-run}" >&2; exit 2 ;;
esac
