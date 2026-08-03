import httpx
import pytest
from fastapi import FastAPI

from app.api.middleware import (
    MAX_REQUEST_ID_LENGTH,
    REQUEST_ID_HEADER,
    RequestContextMiddleware,
    _safe_request_id,
)
from app.core.logging import RequestIdFilter, request_id_var


def build_app(monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    """Приложение с одним падающим маршрутом и без записи в базу."""

    recorded: list[dict] = []
    monkeypatch.setattr(
        "app.api.middleware.record_error",
        lambda **kwargs: recorded.append(kwargs),
    )

    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)

    @app.get("/boom")
    def boom() -> None:
        raise ValueError("тестовая поломка")

    @app.get("/fine")
    def fine() -> dict[str, str]:
        return {"status": "ok"}

    app.state.recorded = recorded
    return app


async def request(app: FastAPI, path: str, headers: dict | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path, headers=headers)


async def test_unhandled_error_returns_request_id(monkeypatch: pytest.MonkeyPatch) -> None:
    app = build_app(monkeypatch)
    response = await request(app, "/boom")

    assert response.status_code == 500
    body = response.json()
    # Наружу уходит только код запроса, без текста исключения.
    assert "тестовая поломка" not in str(body)
    assert body["request_id"] == response.headers[REQUEST_ID_HEADER]


async def test_unhandled_error_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    app = build_app(monkeypatch)
    await request(app, "/boom")

    recorded = app.state.recorded
    assert len(recorded) == 1
    assert "тестовая поломка" in recorded[0]["message"]
    assert "ValueError" in recorded[0]["detail"]
    assert recorded[0]["path"] == "/boom"
    assert recorded[0]["status_code"] == 500


async def test_client_request_id_is_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    app = build_app(monkeypatch)
    response = await request(app, "/fine", headers={REQUEST_ID_HEADER: "trace-42"})

    # Идентификатор клиента сохраняем: по нему сшиваются логи разных систем.
    assert response.headers[REQUEST_ID_HEADER] == "trace-42"


@pytest.mark.parametrize(
    "incoming",
    [
        # Значения заголовков кодируются latin-1: непечатаемое и не-ASCII
        # уронило бы ответ при попытке вернуть такой идентификатор обратно.
        "код-42",
        "trace\n42",
        "",
        None,
    ],
)
def test_unsafe_request_id_is_replaced(incoming: str | None) -> None:
    result = _safe_request_id(incoming)
    assert result.isascii()
    assert result.isprintable()
    assert result != incoming


def test_safe_request_id_is_kept_and_trimmed() -> None:
    assert _safe_request_id("trace-42") == "trace-42"
    assert len(_safe_request_id("x" * 200)) == MAX_REQUEST_ID_LENGTH


async def test_successful_request_is_not_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    app = build_app(monkeypatch)
    response = await request(app, "/fine")

    assert response.status_code == 200
    assert app.state.recorded == []


def test_request_id_filter_fills_default() -> None:
    record = type("R", (), {})()
    RequestIdFilter().filter(record)  # type: ignore[arg-type]
    assert record.request_id == request_id_var.get()
