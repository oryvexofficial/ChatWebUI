#!/usr/bin/env bash
# Starts the Ollama Web Panel FastAPI server via gunicorn + uvicorn worker.
set -euo pipefail
cd "$(dirname "$0")/.."

exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WORKERS:-1}" \
  --timeout 600 \
  --access-logfile - \
  --error-logfile -
