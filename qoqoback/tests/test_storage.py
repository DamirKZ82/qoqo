from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.services import storage


def make_settings(**overrides: Any) -> Settings:
    """Настройки без оглядки на .env разработчика: тесты не должны от него зависеть."""

    return Settings(_env_file=None, **overrides)


def test_local_storage_writes_file_and_returns_media_url(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "get_settings", lambda: make_settings(media_root=str(tmp_path)))

    url = storage.save_file(b"picture", "branding", ".png", "image/png")

    assert url.startswith("/media/branding/")
    assert url.endswith(".png")
    assert (tmp_path / url.removeprefix("/media/")).read_bytes() == b"picture"


def test_uploaded_name_does_not_reuse_client_filename(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Имя генерируется само: чужая строка в путь не попадает."""

    monkeypatch.setattr(storage, "get_settings", lambda: make_settings(media_root=str(tmp_path)))

    first = storage.save_file(b"a", "content", ".png", "image/png")
    second = storage.save_file(b"b", "content", ".png", "image/png")

    assert first != second


def test_bucket_storage_puts_object_and_returns_public_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_settings(
        s3_bucket="qoqo-media",
        s3_endpoint_url="https://s3.example.com",
        s3_public_url="https://cdn.qoqo.kz",
    )
    monkeypatch.setattr(storage, "get_settings", lambda: settings)

    calls: list[dict[str, Any]] = []

    class FakeClient:
        def put_object(self, **kwargs: Any) -> None:
            calls.append(kwargs)

    monkeypatch.setattr(storage, "_client", FakeClient)

    url = storage.save_file(b"svg", "branding", ".svg", "image/svg+xml")

    assert len(calls) == 1
    assert calls[0]["Bucket"] == "qoqo-media"
    assert calls[0]["Key"].startswith("branding/")
    assert calls[0]["ContentType"] == "image/svg+xml"
    assert url == f"https://cdn.qoqo.kz/{calls[0]['Key']}"


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        (
            {"s3_bucket": "media", "s3_public_url": "https://cdn.qoqo.kz/"},
            "https://cdn.qoqo.kz",
        ),
        (
            {"s3_bucket": "media", "s3_endpoint_url": "https://s3.example.com/"},
            "https://s3.example.com/media",
        ),
        (
            {"s3_bucket": "media", "s3_region": "eu-central-1"},
            "https://media.s3.eu-central-1.amazonaws.com",
        ),
    ],
)
def test_public_base_url(overrides: dict[str, Any], expected: str) -> None:
    assert storage.public_base_url(make_settings(**overrides)) == expected
