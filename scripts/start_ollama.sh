#!/usr/bin/env bash
# Starts `ollama serve`, bound to 127.0.0.1 only, tuned for fast CPU inference & RAM pinning.
set -euo pipefail
cd "$(dirname "$0")/.."

export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:--1}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
export OLLAMA_FLASH_ATTENTION="${OLLAMA_FLASH_ATTENTION:-1}"
export OLLAMA_KV_CACHE_TYPE="${OLLAMA_KV_CACHE_TYPE:-q8_0}"
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-4096}"

export OLLAMA_NUM_THREAD="${OLLAMA_NUM_THREAD:-$(nproc 2>/dev/null || echo 4)}"

exec ollama serve
