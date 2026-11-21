# Ollama Web Panel — 24/7 + GitHub Pages + Cloudflare Tunnel

A full-featured **Ollama** chat web panel with the **Plum Night** React UI, SSE token streaming, a prerendered **GitHub Pages** public site (`pages/`), and a **24/7 self-chaining** GitHub Actions + Cloudflare Quick Tunnel deployment pipeline.

## Features
- **FastAPI Backend (`app/main.py`)**: Serves the React chat UI at `/`, SSE token streaming at `/api/chat/stream`, JSON chat at `/api/chat` (supporting both `{message, history}` and legacy `{prompt}`), health checks at `/health`, and the public site at `/site/`.
- **React "Plum Night" UI (`app/static/`, `web/`)**: Dark purple theme, sidebar thread history, search modal (`Ctrl+K`), Markdown + LaTeX math rendering, visible thinking steps, and toast notifications with undo.
- **GitHub Pages Public Site (`pages/`)**: Prerendered static site (`index.html`, `about/`, `how-it-works/`, `privacy/`, `api/`, `chat/`, `404.html`) with live tunnel status (`assets/status.json`, `api/links.json`, `api/links.txt`).
- **24/7 Self-Chaining Deployment (`.github/workflows/deploy.yml` & `heartbeat.yml`)**:
  - Automatically hands off to a successor run at `290` minutes before the 6-hour GitHub Actions limit.
  - Zero-downtime status publishing to the `gh-pages` branch via `scripts/publish_status.sh`.
  - Self-healing watchdog restarts Ollama, Gunicorn/Uvicorn, or `cloudflared` if any component drops.
  - `heartbeat.yml` runs every 10 minutes as a safety net with exponential backoff.

## Quick Start (GitHub)
1. Push this repository to GitHub.
2. Enable **Settings → Actions → General → Workflow permissions → Read and write permissions**.
3. Enable **Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / `(root)`**.
4. *(Optional)* Add a `PANEL_TOKEN` repository secret under **Settings → Secrets and variables → Actions** to require `?token=YOUR_SECRET`.
5. Run **Actions → Ollama Web Panel 24/7 + Cloudflare Tunnel → Run workflow** (choose any Ollama model, default `qwen2.5:3b`).

## Local Development
```bash
pip install -r requirements-dev.txt
PANEL_DEMO_MODE=1 uvicorn app.main:app --reload --port 8000
# Or with local Ollama:
ollama serve &
ollama pull qwen2.5:3b
uvicorn app.main:app --port 8000
```

## Running Tests
```bash
PANEL_DEMO_MODE=1 pytest -q
```
