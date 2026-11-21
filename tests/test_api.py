import os
os.environ.setdefault("PANEL_DEMO_MODE", "1")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_and_ready():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    r2 = client.get("/api/v1/health")
    assert r2.status_code == 200

    r3 = client.get("/api/v1/ready")
    assert r3.status_code == 200
    assert r3.json()["ready"] is True


def test_discovery_endpoints():
    assert client.get("/api/v1").json()["service"] == "ollama-web-panel"
    assert "limits" in client.get("/api/v1/info").json()
    assert "models" in client.get("/api/v1/models").json()
    assert "rate_limit_rpm" in client.get("/api/v1/config").json()
    assert "requests" in client.get("/api/v1/stats").json()


def test_index_site_and_docs():
    assert client.get("/").status_code == 200
    assert client.get("/site/").status_code == 200
    r = client.get("/api-docs", follow_redirects=False)
    assert r.status_code in (307, 302)


def test_chat_and_v1_chat():
    for path in ("/api/chat", "/api/v1/chat"):
        r = client.post(path, json={"message": "hello", "history": []})
        assert r.status_code == 200
        assert "hello" in r.json()["reply"]


def test_openai_completions():
    r = client.post(
        "/api/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert r.status_code == 200
    assert "ping" in r.json()["choices"][0]["message"]["content"]


def test_chat_empty_rejected():
    r = client.post("/api/v1/chat", json={"message": "   "})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "empty_message"


def test_chat_stream_demo():
    for path in ("/api/chat/stream", "/api/v1/chat/stream"):
        r = client.post(path, json={"message": "hi"})
        assert r.status_code == 200
        assert "data: [DONE]" in r.text


def test_science_models_and_router():
    models = client.get("/api/v1/models").json()["models"]
    ids = {m["id"] for m in models}
    assert "unicollect-science-mini" in ids
    assert "unicollect-science-1.2" in ids

    r = client.post("/api/chat/route", json={"message": "فتوسنتز و پیوند شیمیایی چگونه کار می‌کنند؟"})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "science"
    assert body["is_science"] is True
    assert {m["id"] for m in body["models"]} == {"unicollect-science-mini", "unicollect-science-1.2"}


def test_quantum_physics_routes_to_science():
    q = (
        "یک ذره در یک چاه پتانسیل بینهایت یکبعدی به عرض \\(L\\) در حالت پایه قرار دارد. "
        "به طور ناگهانی و بدون اینکه تابع موج ذره تغییر کند، عرض چاه به \\(2L\\) افزایش می یابد. "
        "احتمال اینکه ذره پس از این تغییر ناگهانی در حالت پایه چاه جدید پیدا شود چقدر است؟ "
        "جواب را به صورت دقیق (کسری/رادیکالی) یا عددی تا سه رقم اعشار بده."
    )
    r = client.post("/api/chat/route", json={"message": q})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "science"
    assert body["is_science"] is True
    assert body["is_math"] is False
