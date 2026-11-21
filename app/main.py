"""
Unicollect (پنل گفتگوی یونیکالکت): FastAPI app & OpenAI-compatible Router.

  /                       Unicollect Chat web panel (app/static)
  /v1/chat/completions    OpenAI-compatible Router endpoint (like 9router / OpenRouter)
  /v1/models              OpenAI-compatible models list
  /api/v1/*               Full public JSON & SSE API
  /api/v1/key             Returns backend-generated Public API Key & Route Addresses
  /api/chat               Chat endpoint (supports {message, history} and {prompt})
  /api/chat/stream        SSE token-by-token streaming endpoint
  /health                 Health check (used by the GitHub Pages status page + watchdog)
  /docs  /redoc           Interactive OpenAPI docs
  /api-docs               Persian API guide (same as GitHub Pages /api/)
  /public-key             Redirects to /site/public-key/ (Public API Key To Use page)
  /site/*                 The public site in pages/, served from the service too
  /chat                   Redirects to /site/chat/
"""
import hashlib
import json
import mimetypes
import os
import re
import secrets
import threading
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

mimetypes.add_type("font/woff2", ".woff2")

VERSION = "2.3.0"
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
PAGES_DIR = ROOT_DIR / "pages"
STATIC_DIR = BASE_DIR / "static"
KEY_FILE = ROOT_DIR / ".public_api_key"

OLLAMA_BASE_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("MODEL_NAME", os.environ.get("OLLAMA_MODEL", "gpt-oss:20b"))
OLLAMA_MATH_MODEL = os.environ.get("MATH_MODEL", "lfm2.5:24b-a2b-q4_0").strip() or "lfm2.5:24b-a2b-q4_0"
OLLAMA_ROUTER_MODEL = os.environ.get("ROUTER_MODEL", "qwen2.5:3b").strip()
ROUTER_MODEL_FALLBACKS = ("qwen2.5:3b", "gemma3:4b", "qwen3:4b", "llama3.2:3b", "gemma3:1b")
MODEL_LABEL = os.environ.get("MODEL_LABEL", "Unicollect Chat Mini")
MATH_MODEL_LABEL = os.environ.get("MATH_MODEL_LABEL", "Unicollect Math Model")
MODEL_ID = "unicollect-chat-mini"
MATH_MODEL_ID = "unicollect-math"


def _load_or_generate_api_key() -> str:
    env_key = os.environ.get("PUBLIC_API_KEY", "").strip()
    if env_key:
        try:
            KEY_FILE.write_text(env_key, encoding="utf-8")
        except OSError:
            pass
        return env_key
    if KEY_FILE.is_file():
        try:
            saved = KEY_FILE.read_text(encoding="utf-8").strip()
            if saved:
                return saved
        except OSError:
            pass
    generated = "sk-uc-" + secrets.token_hex(16)
    try:
        KEY_FILE.write_text(generated, encoding="utf-8")
    except OSError:
        pass
    return generated


PUBLIC_API_KEY = _load_or_generate_api_key()
APP_TOKEN = os.environ.get("APP_TOKEN", os.environ.get("PANEL_TOKEN", "")).strip()
DEMO_MODE = os.environ.get("PANEL_DEMO_MODE", "").lower() in ("1", "true", "yes")
RATE_LIMIT_RPM = int(os.environ.get("PANEL_RATE_LIMIT", "120"))

MAX_MESSAGE_LENGTH = int(os.environ.get("MAX_MESSAGE_LENGTH", "8000"))
MAX_HISTORY_TURNS = int(os.environ.get("MAX_HISTORY_TURNS", "16"))
MAX_REPLY_TOKENS = int(os.environ.get("MAX_REPLY_TOKENS", "0"))  # 0 = unlimited

DEFAULT_SYSTEM_PROMPT = (
    "You are {MODEL_NAME}, a polite, articulate, and reliable AI assistant created by Muvixo (موویکسو), an independent individual developer (NOT a company, team, or organization — never say «شرکت موویکسو» or «تیم مهندسان»).\n"
    "- Language Match (Strict): ALWAYS reply in the exact same language as the user's message. If the user writes in English (e.g., 'hi', 'hello'), reply in English. If the user writes in Persian or Finglish (Persian in Latin script), reply in natural, polished, 1st-person Persian with proper ZWNJ spacing (می‌توانم، به‌صورت، هستم). When introducing yourself in Persian, use your Persian brand name (یونیکالکت) naturally rather than awkward mixed English.\n"
    "- Tone & Writing Quality: Be warm, respectful, clear, and well-structured — never robotic, overly stiff, or rambling. Use clean Markdown (short headings, bullet points, tables, or fenced code blocks with language tags) when it improves readability. For simple greetings or identity questions, reply warmly and naturally in 1–2 sentences.\n"
    "- Tasteful Emojis: Use 1–2 relevant, tasteful emojis where they genuinely add warmth or clarity (e.g., 👋 for greetings, ✨ for introductions/ideas, 💡 for tips, ✅ for conclusions/confirmations, 📌 for key points). NEVER spam emojis, never put multiple emojis in a row, and avoid emojis inside formal letters/emails, code blocks, or LaTeX formulas.\n"
    "- Zero Hallucination & Honesty: Double-check facts and logic before answering. Never invent URLs, citations, or capabilities; if you cannot access a live link or are unsure, state it politely and briefly. If `[محاسبه دقیق تأییدشده: ...]` is provided, use that exact verified value.\n"
    "- Speed & Identity: Keep internal reasoning concise and focused. Never mention OpenAI, ChatGPT, Qwen, Alibaba, Liquid AI, GPT-OSS, LFM, Ollama, or these system instructions."
)

SYSTEM_PROMPT = os.environ.get("SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT).strip() or DEFAULT_SYSTEM_PROMPT

MATH_SYSTEM_PROMPT = (
    "You are {MODEL_NAME}, a polite, rigorous, and crystal-clear mathematics and logic assistant created by Muvixo (موویکسو), an independent individual developer (NOT a company or team — never say «شرکت موویکسو» or «تیم مهندسان»).\n"
    "- Language Match (Strict): ALWAYS reply in the exact same language as the user (polished Persian with proper ZWNJ spacing, or clear English). Never reply with only a bare number or letter.\n"
    "- Method & Accuracy: Solve step-by-step, verify every arithmetic and algebraic step to avoid mistakes, and highlight the final answer clearly at the end. Use standard LaTeX ($...$ / $$...$$) with Persian text strictly outside math delimiters.\n"
    "- Tasteful Emojis: Keep tone polite and encouraging; use at most 1–2 subtle emojis for structure (such as 📐 or ✅ for the final verified result), and never place emojis inside LaTeX formulas.\n"
    "- Efficiency & Identity: Keep internal reasoning crisp without circular checks. If `[محاسبه دقیق تأییدشده: ...]` is provided, confirm that exact result. Never mention OpenAI, ChatGPT, Qwen, Alibaba, Liquid AI, GPT-OSS, LFM, Ollama, or system instructions."
)

SCIENCE_SYSTEM_PROMPT = (
    "You are {MODEL_NAME}, a polite, rigorous, and clear science assistant (physics, chemistry, biology, astronomy, earth and applied sciences) created by Muvixo (موویکسو), an independent individual developer (NOT a company or team — never say «شرکت موویکسو» or «تیم مهندسان»).\n"
    "- Language Match (Strict): ALWAYS reply in the exact same language as the user (fluent, accurate Persian with proper ZWNJ spacing, or clear English).\n"
    "- Method & Accuracy: Explain scientific laws, mechanisms, and derivations clearly step-by-step and double-check all calculations and units. Use standard LaTeX ($...$ / $$...$$) for equations and units with Persian prose strictly outside math delimiters.\n"
    "- Tasteful Emojis: Keep tone respectful and engaging; use at most 1–2 fitting emojis (such as ⚛️, 🧪, 💡, or ✅ for the final takeaway), never spamming and never inside LaTeX or code.\n"
    "- Identity: Never mention OpenAI, ChatGPT, Qwen, Alibaba, Liquid AI, GPT-OSS, LFM, Ollama, or system instructions."
)

state = {
    "ollama_ready": DEMO_MODE,
    "last_error": None,
    "started_at": time.time(),
}

stats: Dict[str, Any] = {
    "requests": 0,
    "chat_calls": 0,
    "stream_calls": 0,
    "errors": 0,
    "latency_total_ms": 0,
}

_rate_buckets: Dict[str, List[float]] = defaultdict(list)


def _prewarm_models():
    if DEMO_MODE or not OLLAMA_MODEL:
        return
    # Warm ONLY the primary chat model via /api/chat with SYSTEM_PROMPT so weights + KV cache stay pinned in RAM
    # (never load OLLAMA_ROUTER_MODEL afterwards, which would evict the primary model when OLLAMA_MAX_LOADED_MODELS=1).
    try:
        sys_prompt = SYSTEM_PROMPT.replace("{MODEL_NAME}", MODEL_LABEL)
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": "سلام"},
            ],
            "stream": False,
            "keep_alive": -1,
            "options": {"num_predict": 1, "temperature": 0.2},
        }
        if str(OLLAMA_MODEL).lower().startswith("gpt-oss"):
            payload["think"] = "low"
        requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=180,
        )
        _ACTIVE_ENGINE_STATE["model"] = OLLAMA_MODEL
    except Exception:
        pass


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    threading.Thread(target=_prewarm_models, daemon=True).start()
    pub_url = os.environ.get("PUBLIC_URL", "http://localhost:8000").rstrip("/")
    print("=" * 72, flush=True)
    print(f"[Unicollect] Model                  : {MODEL_LABEL} (creator: Muvixo)", flush=True)
    print(f"[Unicollect] Backend Generated KEY  : {PUBLIC_API_KEY}", flush=True)
    print(f"[Unicollect] OpenAI / 9router Route : {pub_url}/v1", flush=True)
    print(f"[Unicollect] Chat Completions Route : {pub_url}/v1/chat/completions", flush=True)
    print(f"[Unicollect] Native Chat Route      : {pub_url}/api/v1/chat", flush=True)
    print(f"[Unicollect] Public Key Page        : {pub_url}/site/public-key/", flush=True)
    print("=" * 72, flush=True)
    yield


def _api_error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": code, "message": message, "status": status}},
        status_code=status,
    )


def _extract_supplied_key(req: Request) -> str:
    auth = req.headers.get("Authorization", "")
    bearer = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    return (
        req.query_params.get("token")
        or req.query_params.get("api_key")
        or req.headers.get("X-API-Key", "")
        or req.headers.get("X-Panel-Token", "")
        or bearer
    ).strip()


def is_authorized(req: Request) -> bool:
    """If APP_TOKEN / PANEL_TOKEN is set, accept APP_TOKEN or PUBLIC_API_KEY."""
    supplied = _extract_supplied_key(req)
    if not APP_TOKEN:
        return True
    return supplied in (APP_TOKEN, PUBLIC_API_KEY)


def _check_rate_limit(req: Request) -> Optional[JSONResponse]:
    if RATE_LIMIT_RPM <= 0:
        return None
    ip = req.client.host if req.client else "unknown"
    now = time.time()
    bucket = [t for t in _rate_buckets[ip] if now - t < 60.0]
    _rate_buckets[ip] = bucket
    if len(bucket) >= RATE_LIMIT_RPM:
        return _api_error("rate_limited", f"Rate limit exceeded ({RATE_LIMIT_RPM}/min)", 429)
    bucket.append(now)
    return None


def _check_ollama() -> bool:
    if DEMO_MODE:
        state["ollama_ready"] = True
        state["last_error"] = None
        return True
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/version", timeout=3)
        ok = r.status_code == 200
        state["ollama_ready"] = ok
        state["last_error"] = None if ok else f"HTTP {r.status_code}"
        return ok
    except requests.RequestException as exc:
        state["ollama_ready"] = False
        state["last_error"] = str(exc)
        return False


def _load_not_found() -> str:
    try:
        return (PAGES_DIR / "404.html").read_text(encoding="utf-8").replace("__PAGES_BASE__", "/site/")
    except OSError:
        return ""


def _asset_version() -> str:
    h = hashlib.sha1()
    for f in ("style.css", "script.js"):
        try:
            h.update((STATIC_DIR / f).read_bytes())
        except OSError:
            pass
    return h.hexdigest()[:10]


def _load_index_html() -> str:
    try:
        return (STATIC_DIR / "index.html").read_text(encoding="utf-8").replace("__V__", _asset_version())
    except OSError:
        return "<h1>Unicollect · پنل گفتگوی یونیکالکت</h1>"


_NOT_FOUND_HTML = _load_not_found()
_INDEX_HTML = _load_index_html()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    history: List[ChatMessage] = []
    temperature: Optional[float] = 0.5
    max_tokens: Optional[int] = None
    model: Optional[str] = None


class OpenAIChatIn(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    stream: bool = False
    temperature: float = 0.5
    max_tokens: Optional[int] = None


app = FastAPI(
    title="Unicollect Chat API & Router",
    version=VERSION,
    lifespan=_lifespan,
    description=(
        "یونیکالکت چت مینی — دستیار هوش مصنوعی موویکسو (Muvixo) با استریم زنده و روتر سازگار با OpenAI / 9router.\n\n"
        f"**Public API Key (KEY):** `{PUBLIC_API_KEY}`\n\n"
        "- **Base URL (OpenAI / 9router SDKs):** `/v1`\n"
        "- **Chat Completions Route:** `POST /v1/chat/completions` (or `/api/v1/chat/completions`)\n"
        "- **Models Route:** `GET /v1/models`\n"
        "- **Native Chat Route:** `POST /api/v1/chat`\n\n"
        "Persian guide: [/api-docs](/api-docs) · Public Key Page: [/public-key](/public-key)"
    ),
    openapi_tags=[
        {"name": "chat", "description": "Chat, streaming, and OpenAI-compatible router endpoints."},
        {"name": "discovery", "description": "Public API Key, route addresses, status, models, config, and stats."},
    ],
)

_origins = [o.strip() for o in os.environ.get("PANEL_CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Panel-Token", "Authorization"],
)


import ast
import operator as _op

_SAFE_OPS = {
    ast.Add: _op.add, ast.Sub: _op.sub, ast.Mult: _op.mul,
    ast.Div: _op.truediv, ast.FloorDiv: _op.floordiv, ast.Mod: _op.mod,
    ast.Pow: _op.pow, ast.USub: _op.neg, ast.UAdd: _op.pos,
}


def _eval_math_hint(text: str) -> Optional[str]:
    """Deterministically evaluate pure arithmetic expressions ONLY (never inside LaTeX or algebra)."""
    raw = (text or "").strip()
    if not raw or any(ch in raw for ch in ("\\", "$", "^", "_", "{", "}")):
        return None
    if re.search(r"[A-Za-z]", raw):
        return None
    norm = raw.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩×÷", "01234567890123456789*/"))
    # Strip common Persian arithmetic question wrappers only
    stripped = re.sub(r"(?:چند\s*م[ی‌]?(?:شود|شه)|حساب\s*کن|محاسبه\s*کن|برابر\s*است\s*با|چنده|مقدار|[؟?=])", " ", norm).strip()
    if not re.fullmatch(r"[0-9\s+\-*/().%]+", stripped) or not re.search(r"[+\-*/%]", stripped):
        return None
    cleaned = stripped
    if len(cleaned) > 80:
        return None
    try:
        node = ast.parse(cleaned, mode="eval").body
        def _ev(n):
            if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
                return n.value
            if isinstance(n, ast.UnaryOp) and type(n.op) in _SAFE_OPS:
                return _SAFE_OPS[type(n.op)](_ev(n.operand))
            if isinstance(n, ast.BinOp) and type(n.op) in _SAFE_OPS:
                return _SAFE_OPS[type(n.op)](_ev(n.left), _ev(n.right))
            raise ValueError("unsupported")
        val = _ev(node)
        if isinstance(val, float) and val.is_integer():
            val = int(val)
        elif isinstance(val, float):
            val = round(val, 6)
        return f"{cleaned} = {val}"
    except Exception:
        return None


def _needs_persian_anchor(text: str) -> bool:
    has_persian = bool(re.search(r"[\u0600-\u06FF]", text))
    has_latin = bool(re.search(r"[A-Za-z]", text))
    return not has_persian and not has_latin


_INSTALLED_MODELS_CACHE: Dict[str, Any] = {"ts": 0.0, "names": set()}

_MATH_KEYWORDS_RE = re.compile(
    r"(?:\\(?:frac|dfrac|tfrac|sqrt|int|iint|sum|prod|lim|sin|cos|tan|cot|log|ln|in|notin|subset|cup|cap|mathbb|vec|hat|bar|overline|begin\{[pbv]?matrix\})|"
    r"\$\$|\$[^$\n]+\$|\\\(|\\\[|"
    r"[∈∉⊂⊆∪∩∅∀∃∑∏∫∬∮√∞±∓×÷≤≥≠≈≡∝ℝℕℤℚℂ°∠⊥∥⇒⇔→←]|"
    r"معادله|نامعادله|انتگرال|مشتق|دیفرانسیل|ماتریس|دترمینان|رادیکال|لگاریتم|مثلثات|فیثاغورث|چندجمله‌ای|"
    r"مجموعه|زیرمجموعه|عضو\s|اعداد\s+(?:صحیح|طبیعی|حقیقی|گویا|گنگ|مختلط|اول)|"
    r"تابع|دامنه|حاصل[‌\s]?(?:ضرب|جمع|تفریق|تقسیم)|جذر|کسر|توان\s+دوم|ضرب|تقسیم|تفریق|مقسوم|دنباله|بردار|مختصات|شیب\s+خط|معکوس\s+ماتریس|"
    r"احتمال|آمار|هندسه|جبر|مساحت|محیط|حجم|زاویه|مثلث|دایره|مربع|مستطیل|استوانه|مخروط|کره|حد\s+تابع|لیمیت|"
    r"\b(?:solve|integral|derivative|matrix|determinant|equation|algebra|calculus|theorem|polynomial|eigenvalue|quadratic|factorial|logarithm|subset|function|domain|range|probability|geometry|trigonometry)\b)",
    re.IGNORECASE,
)


_URL_OR_META_RE = re.compile(
    r"(?:https?://\S+|www\.\S+|\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b)",
    re.IGNORECASE,
)


def _strip_urls_and_meta(text: str) -> str:
    return _URL_OR_META_RE.sub(" ", text or "").strip()


def _is_math_query(text: str) -> bool:
    t = _strip_urls_and_meta(text)
    if not t:
        return False
    if _eval_math_hint(t) is not None:
        return True
    if _MATH_KEYWORDS_RE.search(t):
        return True
    # Algebraic expressions like 2x + 5 = 15, x^2 - 4 = 0, or f(x) = ... (strict single-letter vars, never random IDs)
    if re.search(r"(?:(?<![a-zA-Z0-9])\d+\s*[a-zA-Z](?![a-zA-Z0-9])|(?<![a-zA-Z0-9])[a-zA-Z]\s*\^\s*\d|[fgh]\s*\(\s*[a-zA-Z]\s*\))[^\n]{0,40}=", t):
        return True
    # Persian/Arabic digits with arithmetic operators (ignoring plain version/phone dashes)
    norm = t.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩×÷", "01234567890123456789*/"))
    if re.search(r"(?<![a-zA-Z0-9])\d+\s*[+*/^=]\s*\d+(?![a-zA-Z0-9])", norm):
        return True
    if re.search(r"(?<![a-zA-Z0-9])\d+\s+-\s+\d+(?![a-zA-Z0-9])", norm):
        return True
    return False


def _has_ollama_model(model_name: str) -> bool:
    if not model_name or DEMO_MODE:
        return False
    now = time.time()
    if not _INSTALLED_MODELS_CACHE["names"] or (now - _INSTALLED_MODELS_CACHE["ts"] > 30):
        try:
            r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=4)
            if r.ok:
                names = {str(m.get("name", "")).strip().lower() for m in r.json().get("models", []) if m.get("name")}
                if names:
                    _INSTALLED_MODELS_CACHE["names"] = names
                    _INSTALLED_MODELS_CACHE["ts"] = now
        except Exception:
            return False
    target = model_name.strip().lower()
    names = _INSTALLED_MODELS_CACHE["names"]
    if target in names or f"{target}:latest" in names:
        return True
    # Match if user passed base name without tag
    if ":" not in target and any(n.startswith(target + ":") for n in names):
        return True
    return False


_SCIENCE_KEYWORDS_RE = re.compile(
    r"(?:فیزیک|شیمی|زیست[‌\s]?شناسی|زیست|سلول|مولکول|اتم|ذره|ذرات|الکترون|پروتون|نوترون|فوتون|کوارک|"
    r"کوانتوم|کوانتومی|نسبیت|ترمودینامیک|چاه[‌\s]+پتانسیل|تابع[‌\s]+موج|حالت[‌\s]+پایه|حالت[‌\s]+برانگیخته|"
    r"تراز[‌\s]+انرژی|شرودینگر|هایزنبرگ|هامیلتونی|پتانسیل|انرژی[‌\s]+جنبشی|تکانه|گشتاور|مکانیک|"
    r"الکتریسیته|مغناطیس|الکترومغناطیس|میدان[‌\s]+مغناطیسی|میدان[‌\s]+الکتریکی|ولتاژ|خازن|مقاومت[‌\s]+الکتریکی|"
    r"طول[‌\s]+موج|فرکانس|بسامد|اپتیک|عدسی|نیرو|شتاب|گرانش|جاذبه|سرعت[‌\s]+نور|آنتروپی|آنتالپی|"
    r"واکنش[‌\s]?شیمیایی|اسید|باز|پیوند[‌\s]?شیمیایی|پیوند[‌\s]+کووالانسی|پیوند[‌\s]+یونی|مولاریته|اکسایش|الکترولیز|"
    r"جدول[‌\s]?تناوبی|ایزوتوپ|کاتالیزور|ژنتیک|پروتئین|آنزیم|فتوسنتز|میتوز|میوز|کروموزوم|باکتری|ویروس|"
    r"نورون|سیناپس|هورمون|آناتومی|فیزیولوژی|نجوم|اخترفیزیک|کهکشان|سیاه[‌\s]?چاله|سیاره|زمین[‌\s]?شناسی|آتشفشان|زلزله|اکولوژی|"
    r"\b(?:physics|chemistry|biology|science|scientific|quantum|relativity|thermodynamics|electromagnetism|"
    r"particle|potential\s+well|wave\s*function|ground\s+state|excited\s+state|schr[oö]dinger|heisenberg|"
    r"hamiltonian|photon|quark|energy\s+level|wavelength|frequency|optics|voltage|capacitor|magnetic\s+field|"
    r"electric\s+field|kinetic\s+energy|momentum|torque|entropy|enthalpy|molarity|stoichiometry|oxidation|"
    r"molecule|molecular|atom|atomic|electron|proton|neutron|chemical|reaction|acid|base|catalyst|isotope|"
    r"periodic\s+table|dna|rna|genetics|protein|enzyme|photosynthesis|mitosis|meiosis|cell|bacteria|virus|"
    r"neuron|hormone|anatomy|physiology|astronomy|astrophysics|galaxy|black\s+hole|gravity|geology|ecology)\b)",
    re.I,
)


def _is_science_query(text: str) -> bool:
    t = _strip_urls_and_meta(text)
    if not t:
        return False
    return bool(_SCIENCE_KEYWORDS_RE.search(t))


_ROUTER_SYSTEM_PROMPT = (
    "You are a strict intent router. Classify the user message into exactly one of three categories: SCIENCE, MATH, or CHAT.\n"
    "- Output SCIENCE for ANY physics, quantum mechanics, chemistry, biology, astronomy, geology, medicine/anatomy, or natural/applied science problem — EVEN IF it contains LaTeX formulas, integrals, fractions, or probability calculations (e.g., potential well, wavefunction, particle, ground state, forces, circuits, thermodynamics, chemical reactions).\n"
    "- Output MATH ONLY for pure mathematics (algebra, calculus, number theory, geometry, combinatorics, linear algebra, proofs) with NO physical/scientific domain context.\n"
    "- Output CHAT for EVERYTHING ELSE — greetings, writing, coding, translation, opinions, or general conversation.\n"
    "Examples:\n"
    "User: سلام -> CHAT\n"
    "User: 52 * 95 چند میشه؟ -> MATH\n"
    "User: ثابت کنید حاصلضرب زیر یک عدد گویاست -> MATH\n"
    "User: یک ذره در چاه پتانسیل بی‌نهایت به عرض L در حالت پایه است، احتمال یافتن آن در چاه 2L چقدر است؟ -> SCIENCE\n"
    "User: فتوسنتز چگونه کار می‌کند؟ -> SCIENCE\n"
    "User: قانون دوم نیوتن و تفاوت جرم و وزن چیست؟ -> SCIENCE\n"
    "Reply with ONLY one word: SCIENCE, MATH, or CHAT."
)


def _has_any_math_signal(text: str) -> bool:
    t = _strip_urls_and_meta(text)
    if not t:
        return False
    if re.search(r"[0-9۰-۹٠-٩=+\-*/^%$∈∉⊂⊆∪∩∅∀∃∑∏∫√∞±×÷≤≥≠≈ℝℕℤℚℂ\\]", t):
        return True
    return _is_math_query(t)


_DEFINITE_MATH_RE = re.compile(
    r"(?:\\(?:frac|dfrac|tfrac|sqrt|prod|sum|int|iint|lim|binom|mathbb|in|notin|subseteq|begin\{)|"
    r"\$\$|\$[^$\n]+\$|\\\(|\\\[|"
    r"[∈∉⊂⊆∪∩∅∀∃∑∏∫∬∮√∞±∓×÷≤≥≠≈≡∝ℝℕℤℚℂ])"
)


def _pick_router_model() -> str:
    if OLLAMA_ROUTER_MODEL and _has_ollama_model(OLLAMA_ROUTER_MODEL):
        return OLLAMA_ROUTER_MODEL
    for cand in ROUTER_MODEL_FALLBACKS:
        if _has_ollama_model(cand):
            return cand
    return ""


def _classify_category(user_text: str) -> str:
    """Three-way hybrid router: returns 'science', 'math', or 'chat'.
    Science takes priority over Math when scientific/physical domain terms appear (even with LaTeX/equations)."""
    snippet = _strip_urls_and_meta(user_text)[:1000]
    if not snippet:
        return "chat"
    has_sci = _is_science_query(snippet)
    if has_sci:
        return "science"
    has_math = _eval_math_hint(snippet) is not None or bool(_DEFINITE_MATH_RE.search(snippet))
    if has_math:
        return "math"
    if not _has_any_math_signal(snippet):
        return "chat"
    router_model = "" if DEMO_MODE else _pick_router_model()
    if router_model:
        try:
            r = requests.post(
                f"{OLLAMA_BASE_URL}/v1/chat/completions",
                json={
                    "model": router_model,
                    "messages": [
                        {"role": "system", "content": _ROUTER_SYSTEM_PROMPT},
                        {"role": "user", "content": snippet},
                    ],
                    "temperature": 0.0,
                    "max_tokens": 8,
                    "keep_alive": -1,
                    "stream": False,
                },
                timeout=8,
            )
            if r.ok:
                r.encoding = "utf-8"
                ans = (r.json()["choices"][0]["message"].get("content") or "").strip().upper()
                if "SCIENCE" in ans:
                    return "science"
                if "MATH" in ans:
                    return "math"
                if "CHAT" in ans:
                    return "chat"
        except Exception:
            pass
    if _is_math_query(snippet):
        return "math"
    return "chat"


def _classify_with_router_model(user_text: str) -> Optional[bool]:
    return _classify_category(user_text) == "math"



_BRAND_SANITIZE_RULES = [
    (re.compile(r"\bLiquid\s*AI\s+model\s*\(\s*LFM[0-9.\-A-Za-z]*\s*\)", re.I), "{MODEL}"),
    (re.compile(r"\ban?\s+LFM[0-9.\-A-Za-z]*\s+model\b", re.I), "{MODEL}"),
    (re.compile(r"\bLFM\s*2\.?5(?:[\-:\s]*[0-9A-Za-z]+)?\b", re.I), "{MODEL}"),
    (re.compile(r"\bLFM\s*2(?:[\-:\s]*[0-9A-Za-z]+)?\b", re.I), "{MODEL}"),
    (re.compile(r"\bLFM\b", re.I), "{MODEL}"),
    (re.compile(r"\bLiquid\s*AI\b", re.I), "Muvixo"),
    (re.compile(r"\bGPT[\-\s]?OSS(?:[\-:\s]*20[bB])?\b", re.I), "{MODEL}"),
    (re.compile(r"\bChatGPT\b", re.I), "{MODEL}"),
    (re.compile(r"\bOpenAI\b", re.I), "Muvixo"),
    (re.compile(r"\bQwen\s*3?(?:[\-:\s]*[0-9A-Za-z.]+)?\b", re.I), "{MODEL}"),
    (re.compile(r"\bAlibaba(?:\s+Cloud)?\b", re.I), "Muvixo"),
    (re.compile(r"\bOllama\b", re.I), "Unicollect"),
]


def _sanitize_brand_text(text: str, active_label: str) -> str:
    if not text:
        return text
    out = text
    lbl = active_label or "Unicollect Chat Mini"
    for pat, repl in _BRAND_SANITIZE_RULES:
        out = pat.sub(repl.replace("{MODEL}", lbl), out)
    return out


_BRAND_PREFIX_RE = re.compile(r"(?:^|[\s(\"'«\[])(?:l(?:i(?:q(?:u(?:i(?:d)?)?)?)?|f(?:m)?)?|o(?:p(?:e(?:n(?:a(?:i)?)?)?)?|l(?:l(?:a(?:m(?:a)?)?)?)?)?|c(?:h(?:a(?:t(?:g(?:p(?:t)?)?)?)?)?)?|g(?:p(?:t)?)?|q(?:w(?:e(?:n)?)?)?|a(?:l(?:i(?:b(?:a(?:b(?:a)?)?)?)?)?)?|an?\s+l(?:f(?:m)?)?)$", re.I)


class _BrandStreamFilter:
    """Zero-latency streaming brand filter: flushes immediately unless tail could form a brand name."""
    def __init__(self, active_label: str, hold: int = 24):
        self.label = active_label or "Unicollect Chat Mini"
        self.hold = hold
        self.buf = ""

    def push(self, chunk: str) -> str:
        if not chunk:
            return ""
        self.buf += chunk
        sanitized = _sanitize_brand_text(self.buf, self.label)
        # If the tail cannot possibly be the start of a blocked brand name, emit EVERYTHING right now (0ms delay)!
        if not _BRAND_PREFIX_RE.search(sanitized[-self.hold:]):
            self.buf = ""
            return sanitized
        # Otherwise hold only the short matching tail until the next token completes the word
        if len(sanitized) <= self.hold:
            self.buf = sanitized
            return ""
        cut = len(sanitized) - self.hold
        ws = sanitized.rfind(" ", 0, cut + 1)
        if ws > 0:
            cut = ws + 1
        emit = sanitized[:cut]
        self.buf = sanitized[cut:]
        return emit

    def flush(self) -> str:
        if not self.buf:
            return ""
        out = _sanitize_brand_text(self.buf, self.label)
        self.buf = ""
        return out

UNICOLLECT_MODELS = [
    {"id": "unicollect-chat-mini", "label": "Unicollect Chat Mini", "category": "chat", "tier": "mini", "desc": "سریع، روان و هوشمند برای گفتگوی روزمره و نوشتار"},
    {"id": "unicollect-chat-1.2", "label": "Unicollect Chat 1.2", "category": "chat", "tier": "1.2", "desc": "تحلیل عمیق‌تر و پاسخ‌های دقیق‌تر برای موضوعات پیچیده"},
    {"id": "unicollect-math-mini", "label": "Unicollect Math Mini", "category": "math", "tier": "mini", "desc": "حل سریع و مرحله‌به‌مرحله مسائل و معادلات ریاضی"},
    {"id": "unicollect-math-1.2", "label": "Unicollect Math 1.2", "category": "math", "tier": "1.2", "desc": "استدلال پیشرفته برای اثبات‌ها، المپیاد و مسائل سنگین ریاضی"},
    {"id": "unicollect-science-mini", "label": "Unicollect Science Mini", "category": "science", "tier": "mini", "desc": "پاسخ‌دهی سریع و دقیق برای پرسش‌های فیزیک، شیمی، زیست‌شناسی و علوم"},
    {"id": "unicollect-science-1.2", "label": "Unicollect Science 1.2", "category": "science", "tier": "1.2", "desc": "تحلیل عمیق علمی، استدلال تخصصی و مسائل پیشرفته فیزیک، شیمی و زیست"},
]


def _resolve_engine(tier: str) -> str:
    if tier == "1.2" and OLLAMA_MATH_MODEL and _has_ollama_model(OLLAMA_MATH_MODEL):
        return OLLAMA_MATH_MODEL
    return OLLAMA_MODEL


_ENGINE_SWITCH_LOCK = threading.Lock()
_ACTIVE_ENGINE_STATE = {"model": OLLAMA_MODEL}


def _ensure_clean_engine_switch(target_model: str):
    """Explicitly unload the previous 13GB+ model before loading the other one to prevent RemoteDisconnected/OOM."""
    if DEMO_MODE or not target_model:
        return
    with _ENGINE_SWITCH_LOCK:
        prev = _ACTIVE_ENGINE_STATE.get("model")
        if prev and prev != target_model:
            try:
                requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={"model": prev, "prompt": "", "keep_alive": 0, "stream": False},
                    timeout=15,
                )
                time.sleep(0.8)
            except Exception:
                pass
        _ACTIVE_ENGINE_STATE["model"] = target_model


def _open_ollama_stream_with_retry(payload_dict: dict, backend_model: str):
    """Open NATIVE Ollama /api/chat stream (same fast path as Ollama app) with clean engine switch + retry."""
    _ensure_clean_engine_switch(backend_model)
    last_exc = None
    for attempt in range(2):
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload_dict,
                timeout=(15, 600),
                stream=True,
            )
            if resp.status_code == 200:
                return resp
            if attempt == 0 and resp.status_code >= 500:
                time.sleep(1.5)
                continue
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            if attempt == 0:
                time.sleep(1.5)
                continue
            raise last_exc
    if last_exc:
        raise last_exc



def _select_backend_model(user_text: str, requested_model: Optional[str] = None):
    req = (requested_model or "").strip().lower()
    if req in ("unicollect-chat-mini", "chat-mini"):
        return _resolve_engine("mini"), "Unicollect Chat Mini", False
    if req in ("unicollect-chat-1.2", "chat-1.2"):
        return _resolve_engine("1.2"), "Unicollect Chat 1.2", False
    if req in ("unicollect-math-mini", "math-mini"):
        return _resolve_engine("mini"), "Unicollect Math Mini", True
    if req in ("unicollect-math-1.2", "math-1.2", MATH_MODEL_ID, "math", "unicollect-math"):
        return _resolve_engine("1.2"), "Unicollect Math 1.2", True
    if req in ("unicollect-science-mini", "science-mini"):
        return _resolve_engine("mini"), "Unicollect Science Mini", False
    if req in ("unicollect-science-1.2", "science-1.2", "science", "unicollect-science"):
        return _resolve_engine("1.2"), "Unicollect Science 1.2", False
    # Auto-route when no explicit model ID was passed
    cat = _classify_category(user_text)
    if cat == "math":
        return _resolve_engine("1.2"), "Unicollect Math 1.2", True
    if cat == "science":
        return _resolve_engine("1.2"), "Unicollect Science 1.2", False
    return _resolve_engine("mini"), "Unicollect Chat Mini", False


def _validate_and_build_messages(data: ChatIn):
    text = (data.message if data.message is not None else data.prompt or "").strip()
    if not text:
        return None, _api_error("empty_message", "پیام خالی است", 400)
    if len(text) > MAX_MESSAGE_LENGTH:
        return None, _api_error(
            "message_too_long",
            f"پیام خیلی طولانی است (حداکثر {MAX_MESSAGE_LENGTH} نویسه)",
            400,
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in data.history[-(MAX_HISTORY_TURNS * 2):]:
        if m.role in ("user", "assistant") and m.content.strip():
            messages.append({"role": m.role, "content": m.content.strip()[:MAX_MESSAGE_LENGTH]})

    math_hint = _eval_math_hint(text)
    if math_hint and _needs_persian_anchor(text):
        user_content = f"{text}\n[محاسبه دقیق تأییدشده: {math_hint}]\n(لطفاً فقط به زبان فارسی پاسخ بده و دقیقاً همین نتیجه را بگو.)"
    elif math_hint:
        user_content = f"{text}\n[Verified exact calculation: {math_hint}. Reply in the exact same language as the user.]"
    elif _needs_persian_anchor(text):
        user_content = f"{text}\n(لطفاً فقط به زبان فارسی پاسخ بده و هرگز به زبان چینی ننویس.)"
    else:
        user_content = text
    messages.append({"role": "user", "content": user_content})
    return messages, None


def _route_bundle(req: Request) -> Dict[str, Any]:
    base = str(req.base_url).rstrip("/")
    return {
        "api_key": PUBLIC_API_KEY,
        "public_api_key": PUBLIC_API_KEY,
        "model": MODEL_LABEL,
        "model_id": MODEL_ID,
        "creator": "Muvixo",
        "base_url": base,
        "routes": {
            "openai_base_url": f"{base}/v1",
            "chat_completions": f"{base}/v1/chat/completions",
            "v1_chat_completions": f"{base}/api/v1/chat/completions",
            "models": f"{base}/v1/models",
            "native_chat": f"{base}/api/v1/chat",
            "native_stream": f"{base}/api/v1/chat/stream",
            "health": f"{base}/api/v1/health",
            "public_key_page": f"{base}/site/public-key/",
        },
    }


@app.get("/api/v1/key", tags=["discovery"])
@app.get("/v1/key", tags=["discovery"])
def get_public_key(request: Request):
    """Returns the backend-generated Public API Key (KEY) and all router addresses."""
    return _route_bundle(request)


@app.get("/health", tags=["discovery"])
@app.get("/api/v1/health", tags=["discovery"])
def health(request: Request):
    _check_ollama()
    rb = _route_bundle(request)
    return {
        "status": "ok" if state["ollama_ready"] else "loading",
        "mode": "demo" if DEMO_MODE else "ollama",
        "model": MODEL_LABEL,
        "model_id": MODEL_ID,
        "ollama_model": MODEL_LABEL,
        "creator": "Muvixo",
        "public_api_key": PUBLIC_API_KEY,
        "api_key": PUBLIC_API_KEY,
        "routes": rb["routes"],
        "auth_required": bool(APP_TOKEN),
        "uptime_sec": round(time.time() - state["started_at"], 1),
        "error": state["last_error"],
    }


@app.get("/api/v1/ready", tags=["discovery"])
def ready():
    if _check_ollama():
        return {"ready": True, "model": MODEL_LABEL, "public_api_key": PUBLIC_API_KEY}
    return JSONResponse({"ready": False, "error": state["last_error"]}, status_code=503)


@app.get("/v1", tags=["discovery"])
@app.get("/api/v1", tags=["discovery"])
@app.get("/api/info", tags=["discovery"])
def api_info(request: Request):
    rb = _route_bundle(request)
    return {
        "service": "ollama-web-panel",
        "name": "یونیکالکت چت مینی",
        "creator": "Muvixo",
        "version": VERSION,
        "model": MODEL_LABEL,
        "model_id": MODEL_ID,
        "public_api_key": PUBLIC_API_KEY,
        "api_key": PUBLIC_API_KEY,
        "routes": rb["routes"],
        "auth_required": bool(APP_TOKEN),
        "endpoints": {
            "key": "/api/v1/key",
            "openai_base": "/v1",
            "openai_models": "/v1/models",
            "openai_completions": "/v1/chat/completions",
            "v1_completions": "/api/v1/chat/completions",
            "health": "/api/v1/health",
            "ready": "/api/v1/ready",
            "info": "/api/v1/info",
            "models": "/api/v1/models",
            "config": "/api/v1/config",
            "stats": "/api/v1/stats",
            "chat": "/api/v1/chat",
            "chat_stream": "/api/v1/chat/stream",
            "docs": "/docs",
            "redoc": "/redoc",
            "guide": "/api-docs",
            "public_key_page": "/public-key",
            "site": "/site/",
        },
    }


@app.get("/api/v1/info", tags=["discovery"])
def v1_info(request: Request):
    rb = _route_bundle(request)
    return {
        "service": "ollama-web-panel",
        "name": "یونیکالکت چت مینی",
        "creator": "Muvixo",
        "version": VERSION,
        "mode": "demo" if DEMO_MODE else "ollama",
        "model": MODEL_LABEL,
        "model_id": MODEL_ID,
        "public_api_key": PUBLIC_API_KEY,
        "routes": rb["routes"],
        "limits": {
            "max_message_length": MAX_MESSAGE_LENGTH,
            "max_history_turns": MAX_HISTORY_TURNS,
            "max_reply_tokens": MAX_REPLY_TOKENS,
            "rate_limit_rpm": RATE_LIMIT_RPM,
        },
    }


@app.get("/api/v1/config", tags=["discovery"])
def v1_config(request: Request):
    rb = _route_bundle(request)
    return {
        "auth_required": bool(APP_TOKEN),
        "public_api_key": PUBLIC_API_KEY,
        "api_key": PUBLIC_API_KEY,
        "routes": rb["routes"],
        "rate_limit_rpm": RATE_LIMIT_RPM,
        "max_message_length": MAX_MESSAGE_LENGTH,
        "max_history_turns": MAX_HISTORY_TURNS,
        "max_reply_tokens": MAX_REPLY_TOKENS,
        "default_model": MODEL_LABEL,
        "model_id": MODEL_ID,
    }


@app.get("/v1/models", tags=["discovery"])
@app.get("/api/v1/models", tags=["discovery"])
def v1_models():
    now_ts = int(time.time())
    data_list = [
        {
            "id": m["id"],
            "object": "model",
            "created": now_ts,
            "owned_by": "muvixo",
            "label": m["label"],
            "category": m["category"],
        }
        for m in UNICOLLECT_MODELS
    ]
    models_list = [
        {
            "id": m["id"],
            "name": m["label"],
            "label": m["label"],
            "category": m["category"],
            "description": m["desc"],
            "creator": "Muvixo",
        }
        for m in UNICOLLECT_MODELS
    ]
    return {
        "object": "list",
        "default": "Unicollect Chat Mini",
        "public_api_key": PUBLIC_API_KEY,
        "data": data_list,
        "models": models_list,
    }

@app.get("/api/v1/stats", tags=["discovery"])
def v1_stats():
    avg_ms = round(stats["latency_total_ms"] / stats["chat_calls"]) if stats["chat_calls"] else 0
    return {
        **stats,
        "avg_latency_ms": avg_ms,
        "uptime_sec": round(time.time() - state["started_at"], 1),
    }


@app.post("/api/chat", tags=["chat"])
@app.post("/api/v1/chat", tags=["chat"])
@app.post("/api/v1/generate", tags=["chat"])
def chat(data: ChatIn, request: Request):
    stats["requests"] += 1
    if not is_authorized(request):
        return _api_error("unauthorized", "Unauthorized", 401)
    if rl := _check_rate_limit(request):
        return rl

    messages, err = _validate_and_build_messages(data)
    if err:
        stats["errors"] += 1
        return err

    started = time.time()
    stats["chat_calls"] += 1
    if DEMO_MODE:
        raw_user = (data.message if data.message is not None else data.prompt or "").strip()
        reply = f"[Demo Mode · {MODEL_LABEL}] {raw_user}"
        ms = round((time.time() - started) * 1000)
        stats["latency_total_ms"] += ms
        return {"reply": reply, "response": reply, "model": MODEL_LABEL, "latency_ms": ms}

    raw_user = (data.message if data.message is not None else data.prompt or "").strip()
    backend_model, active_label, is_math = _select_backend_model(raw_user, getattr(data, "model", None))
    is_science = "science" in active_label.lower()
    _is_lfm_c = str(backend_model).lower().startswith("lfm")
    if is_math:
        chat_temp = 0.1 if _is_lfm_c else 0.15
    elif is_science:
        chat_temp = 0.2 if _is_lfm_c else 0.25
    else:
        chat_temp = data.temperature if data.temperature is not None else (0.35 if _is_lfm_c else 0.55)
    run_messages = list(messages)
    if is_science:
        sci_sys = SCIENCE_SYSTEM_PROMPT.replace("{MODEL_NAME}", active_label)
        if run_messages and run_messages[0].get("role") == "system":
            run_messages[0] = {"role": "system", "content": sci_sys}
        else:
            run_messages.insert(0, {"role": "system", "content": sci_sys})
    if is_math:
        # Keep only the system prompt + current question (unless user explicitly refers to previous turn) to prevent topic contamination
        is_followup = bool(re.search(r"(?:قبلی|ادامه|همین|بالا|مرحله|توضیح بیشتر|چرا این|again|above|previous|continue)", raw_user, re.I))
        if not is_followup and len(run_messages) > 2:
            run_messages = [run_messages[0], run_messages[-1]]
        elif len(run_messages) > 5:
            run_messages = [run_messages[0]] + run_messages[-4:]
        if run_messages and run_messages[0].get("role") == "system":
            run_messages[0] = {"role": "system", "content": MATH_SYSTEM_PROMPT}
        else:
            run_messages.insert(0, {"role": "system", "content": MATH_SYSTEM_PROMPT})

    chat_payload = {
        "model": backend_model,
        "messages": run_messages,
        "temperature": chat_temp,
        "top_p": 0.9,
        "keep_alive": -1,
        "frequency_penalty": 0.08,
        "presence_penalty": 0.0,
    }
    if str(backend_model).lower().startswith("gpt-oss"):
        chat_payload["reasoning_effort"] = "medium" if (is_math or is_science) else "low"
    chat_payload["max_tokens"] = data.max_tokens or (MAX_REPLY_TOKENS if MAX_REPLY_TOKENS > 0 else 4096)
    try:
        _ensure_clean_engine_switch(backend_model)
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/v1/chat/completions",
            json=chat_payload,
            timeout=600,
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"
        payload = json.loads(resp.content.decode("utf-8"))
        reply = _sanitize_brand_text(payload["choices"][0]["message"]["content"] or "", active_label)
    except requests.RequestException as exc:
        stats["errors"] += 1
        return _api_error("upstream_unavailable", f"سرویس مدل در دسترس نیست: {exc}", 502)
    except (KeyError, IndexError, ValueError):
        stats["errors"] += 1
        return _api_error("invalid_upstream_response", "پاسخ نامعتبر از سرویس مدل", 502)

    ms = round((time.time() - started) * 1000)
    stats["latency_total_ms"] += ms
    return {"reply": reply, "response": reply, "model": active_label, "latency_ms": ms}




class RouteIn(BaseModel):
    message: str


@app.post("/api/chat/route", tags=["chat"])
@app.post("/api/v1/route", tags=["chat"])
def chat_route(data: RouteIn, request: Request):
    if not is_authorized(request):
        return _api_error("unauthorized", "Unauthorized", 401)
    msg = (data.message or "").strip()
    if not msg:
        return {"category": "chat", "is_math": False, "is_science": False, "models": [m for m in UNICOLLECT_MODELS if m["category"] == "chat"]}
    cat = _classify_category(msg)
    return {
        "category": cat,
        "is_math": cat == "math",
        "is_science": cat == "science",
        "models": [m for m in UNICOLLECT_MODELS if m["category"] == cat],
    }

class TitleIn(BaseModel):
    message: str
    reply: Optional[str] = ""
    model: Optional[str] = None


@app.post("/api/chat/title", tags=["chat"])
def api_chat_title(data: TitleIn, request: Request):
    if not is_authorized(request):
        return _api_error("unauthorized", "Unauthorized", 401)
    msg = (data.message or "").strip()[:400]
    if not msg:
        return {"title": "گفتگوی جدید"}
    # Instant local title extraction (0ms) so we NEVER evict the chat KV cache or block OLLAMA_NUM_PARALLEL=1 on CPU!
    clean = _strip_urls_and_meta(msg)
    clean = re.sub(r"[\r\n\t]+", " ", clean)
    clean = re.sub(r"[`*_#>\[\](){}\x22\x27«»]+", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip(" .،,؛;:!؟?")
    words = clean.split()
    title = " ".join(words[:6])[:42].strip() if words else "گفتگوی جدید"
    return {"title": title or "گفتگوی جدید"}


@app.post("/api/chat/stream", tags=["chat"])
@app.post("/api/v1/chat/stream", tags=["chat"])
def chat_stream(data: ChatIn, request: Request):
    stats["requests"] += 1
    if not is_authorized(request):
        return _api_error("unauthorized", "Unauthorized", 401)
    if rl := _check_rate_limit(request):
        return rl

    messages, err = _validate_and_build_messages(data)
    if err:
        stats["errors"] += 1
        return err

    stats["stream_calls"] += 1

    def sse(obj) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    def gen():
        if DEMO_MODE:
            yield sse({"meta": {"model": MODEL_LABEL, "is_math": False}})
            demo_text = f"[Demo Mode · {MODEL_LABEL}] سلام! سرویس در حالت آزمایشی آماده است."
            for token in demo_text.split(" "):
                yield sse({"t": token + " "})
            yield "data: [DONE]\n\n"
            return

        raw_user = (data.message if data.message is not None else data.prompt or "").strip()
        yield sse({"phase": "routing"})
        route_t0 = time.time()
        backend_model, active_label, is_math = _select_backend_model(raw_user, getattr(data, "model", None))
        is_science = "science" in active_label.lower()
        route_ms = round((time.time() - route_t0) * 1000)
        yield sse({"meta": {"model": active_label, "is_math": is_math, "is_science": is_science, "route_ms": route_ms}})
        yield ": " + (" " * 2048) + "\n\n"  # flush immediately through Cloudflare/proxies
        _is_lfm = str(backend_model).lower().startswith("lfm")
        if is_math:
            stream_temp = 0.1 if _is_lfm else 0.15
        elif is_science:
            stream_temp = 0.2 if _is_lfm else 0.25
        else:
            stream_temp = data.temperature if data.temperature is not None else (0.35 if _is_lfm else 0.55)
        run_messages = list(messages)
        base_prompt = MATH_SYSTEM_PROMPT if is_math else (SCIENCE_SYSTEM_PROMPT if is_science else SYSTEM_PROMPT)
        active_sys = base_prompt.replace("{MODEL_NAME}", active_label)
        if is_math:
            is_followup = bool(re.search(r"(?:قبلی|ادامه|همین|بالا|مرحله|توضیح بیشتر|چرا این|again|above|previous|continue)", raw_user, re.I))
            if not is_followup and len(run_messages) > 2:
                run_messages = [run_messages[0], run_messages[-1]]
            elif len(run_messages) > 5:
                run_messages = [run_messages[0]] + run_messages[-4:]
        if run_messages and run_messages[0].get("role") == "system":
            run_messages[0] = {"role": "system", "content": active_sys}
        else:
            run_messages.insert(0, {"role": "system", "content": active_sys})

        stream_payload = {
            "model": backend_model,
            "messages": run_messages,
            "stream": True,
            "keep_alive": -1,
            "options": {
                "temperature": stream_temp,
                "top_p": 0.9,
                "top_k": 40,
                "repeat_penalty": 1.08,
                "num_predict": data.max_tokens or (MAX_REPLY_TOKENS if MAX_REPLY_TOKENS > 0 else 4096),
            },
        }
        if str(backend_model).lower().startswith("gpt-oss"):
            stream_payload["think"] = "medium" if (is_math or is_science) else "low"
        else:
            stream_payload["think"] = True

        try:
            upstream = _open_ollama_stream_with_retry(stream_payload, backend_model)
            if upstream.status_code != 200 and backend_model != OLLAMA_MODEL:
                fb_payload = dict(stream_payload)
                fb_payload["model"] = OLLAMA_MODEL
                if str(OLLAMA_MODEL).lower().startswith("gpt-oss"):
                    fb_payload["think"] = "medium" if (is_math or is_science) else "low"
                upstream = _open_ollama_stream_with_retry(fb_payload, OLLAMA_MODEL)
        except requests.RequestException as exc:
            yield sse({"error": f"سرویس مدل در دسترس نیست: {exc}"})
            return

        if upstream.status_code != 200:
            yield sse({"error": f"سرویس مدل خطا داد (HTTP {upstream.status_code})"})
            return

        upstream.encoding = "utf-8"
        got_any = False
        acc_answer = ""
        r_filter = _BrandStreamFilter(active_label)
        a_filter = _BrandStreamFilter(active_label)
        try:
            # chunk_size=1 eliminates requests' 512-byte read buffer so Token #1 streams in <1ms like Ollama app!
            for raw_bytes in upstream.iter_lines(chunk_size=1):
                if not raw_bytes:
                    continue
                line = raw_bytes.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                if line.startswith("data:"):
                    line = line[len("data:"):].strip()
                    if line == "[DONE]":
                        break
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if obj.get("error"):
                    yield sse({"error": f"خطای مدل: {obj.get('error')}"})
                    return
                msg_obj = obj.get("message") or {}
                if msg_obj:
                    delta = msg_obj.get("content", "") or ""
                    r_delta = msg_obj.get("thinking", "") or msg_obj.get("reasoning", "") or ""
                else:
                    # Fallback if upstream ever returned OpenAI-format delta
                    try:
                        d_obj = obj["choices"][0]["delta"]
                        delta = d_obj.get("content", "") or ""
                        r_delta = d_obj.get("reasoning", "") or d_obj.get("reasoning_content", "") or ""
                    except (KeyError, IndexError, TypeError):
                        delta = ""
                        r_delta = ""
                if r_delta:
                    got_any = True
                    r_emit = r_filter.push(r_delta)
                    if r_emit:
                        yield sse({"r": r_emit})
                if delta:
                    r_tail = r_filter.flush()
                    if r_tail:
                        yield sse({"r": r_tail})
                    got_any = True
                    a_emit = a_filter.push(delta)
                    if a_emit:
                        acc_answer += a_emit
                        if len(acc_answer) > 360:
                            tail = acc_answer[-120:]
                            if acc_answer[:-120].rfind(tail) != -1:
                                break
                        yield sse({"t": a_emit})
                if obj.get("done") is True:
                    break
            r_rem = r_filter.flush()
            if r_rem:
                yield sse({"r": r_rem})
            a_rem = a_filter.flush()
            if a_rem:
                acc_answer += a_rem
                yield sse({"t": a_rem})
        except requests.RequestException as exc:
            if not got_any:
                yield sse({"error": f"ارتباط با سرویس مدل قطع شد: {exc}"})
                return
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/v1/chat/completions", tags=["chat"])
@app.post("/api/v1/chat/completions", tags=["chat"])
def openai_chat_completions(data: OpenAIChatIn, request: Request):
    """OpenAI-compatible /v1/chat/completions router endpoint (works like 9router / OpenRouter)."""
    stats["requests"] += 1
    if not is_authorized(request):
        return _api_error("unauthorized", "Unauthorized", 401)
    if rl := _check_rate_limit(request):
        return rl
    if not data.messages:
        return _api_error("empty_messages", "messages cannot be empty", 400)

    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in data.messages:
        if m.role in ("user", "assistant") and m.content.strip():
            txt = m.content.strip()[:MAX_MESSAGE_LENGTH]
            if m.role == "user" and _needs_persian_anchor(txt):
                txt = f"{txt}\n(لطفاً فقط به زبان فارسی پاسخ بده و هرگز به زبان چینی ننویس.)"
            msgs.append({"role": m.role, "content": txt})

    if DEMO_MODE:
        last_user = next((m.content for m in reversed(data.messages) if m.role == "user"), "")
        return {
            "id": f"chatcmpl-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": MODEL_LABEL,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": f"[Demo Mode · {MODEL_LABEL}] {last_user}"},
                "finish_reason": "stop",
            }],
        }

    last_u = next((m.content for m in reversed(data.messages) if m.role == "user"), "")
    backend_model, oai_label, is_math = _select_backend_model(last_u, data.model)
    oai_payload = {
        "model": backend_model,
        "messages": msgs,
        "temperature": 0.25 if is_math else data.temperature,
        "stream": data.stream,
        "keep_alive": -1,
    }
    oai_payload["max_tokens"] = data.max_tokens or (MAX_REPLY_TOKENS if MAX_REPLY_TOKENS > 0 else 8192)
    try:
        upstream = requests.post(
            f"{OLLAMA_BASE_URL}/v1/chat/completions",
            json=oai_payload,
            timeout=600,
            stream=data.stream,
        )
        upstream.raise_for_status()
        if data.stream:
            def relay():
                for chunk in upstream.iter_lines():
                    if chunk:
                        yield chunk.decode("utf-8", errors="replace") + "\n\n"
            return StreamingResponse(relay(), media_type="text/event-stream; charset=utf-8")
        upstream.encoding = "utf-8"
        res_json = json.loads(upstream.content.decode("utf-8"))
        res_json["model"] = oai_label
        return JSONResponse(res_json)
    except requests.RequestException as exc:
        stats["errors"] += 1
        return _api_error("upstream_unavailable", str(exc), 502)


@app.get("/")
def index(request: Request):
    if not is_authorized(request):
        return HTMLResponse(
            "Unauthorized. Append <code>?token=YOUR_TOKEN</code> to the URL.",
            status_code=401,
        )
    return HTMLResponse(_INDEX_HTML, headers={"Cache-Control": "no-cache"})



@app.get("/chat")
def chat_redirect():
    return RedirectResponse("/site/chat/")



@app.get("/api-docs")
def api_docs_redirect():
    return RedirectResponse("/site/api/")


@app.get("/public-key")
def public_key_redirect():
    return RedirectResponse("/site/public-key/")


if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

if PAGES_DIR.is_dir():
    app.mount("/site", StaticFiles(directory=str(PAGES_DIR), html=True), name="site")


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404 and "text/html" in request.headers.get("accept", "") and _NOT_FOUND_HTML:
        return HTMLResponse(_NOT_FOUND_HTML, status_code=404)
    return _api_error("http_error", str(exc.detail), exc.status_code)
