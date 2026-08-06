from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.services import storage


def make_settings(**overrides: Any) -> Settings:
    """Настройки без оглядки на .env разработчика: тесты не должны от него зависеть."""

    return Settings(_env_file=None, **overrides)


def config(**overrides: Any) -> storage.StorageConfig:
    поля: dict[str, Any] = {
        "bucket": "",
        "endpoint_url": "",
        "region": "",
        "access_key": "",
        "secret_key": "",
        "public_url": "",
    }
    поля.update(overrides)
    return storage.StorageConfig(**поля)


def test_local_storage_writes_file_and_returns_media_url(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "get_settings", lambda: make_settings(media_root=str(tmp_path)))
    monkeypatch.setattr(storage, "resolve_config", config)

    url = storage.save_file(b"picture", "branding", ".png", "image/png")

    assert url.startswith("/media/branding/")
    assert url.endswith(".png")
    assert (tmp_path / url.removeprefix("/media/")).read_bytes() == b"picture"


def test_uploaded_name_does_not_reuse_client_filename(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Имя генерируется само: чужая строка в путь не попадает."""

    monkeypatch.setattr(storage, "get_settings", lambda: make_settings(media_root=str(tmp_path)))
    monkeypatch.setattr(storage, "resolve_config", config)

    first = storage.save_file(b"a", "content", ".png", "image/png")
    second = storage.save_file(b"b", "content", ".png", "image/png")

    assert first != second


def test_bucket_storage_puts_object_and_returns_public_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    настройки = config(
        bucket="qoqo-media",
        endpoint_url="https://s3.example.com",
        public_url="https://cdn.qoqo.kz",
    )
    monkeypatch.setattr(storage, "resolve_config", lambda: настройки)

    calls: list[dict[str, Any]] = []

    class FakeClient:
        def put_object(self, **kwargs: Any) -> None:
            calls.append(kwargs)

    monkeypatch.setattr(storage, "client", lambda _: FakeClient())

    url = storage.save_file(b"svg", "branding", ".svg", "image/svg+xml")

    assert len(calls) == 1
    assert calls[0]["Bucket"] == "qoqo-media"
    assert calls[0]["Key"].startswith("branding/")
    assert calls[0]["ContentType"] == "image/svg+xml"
    assert url == f"https://cdn.qoqo.kz/{calls[0]['Key']}"


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"bucket": "media", "public_url": "https://cdn.qoqo.kz/"}, "https://cdn.qoqo.kz"),
        (
            {"bucket": "media", "endpoint_url": "https://s3.example.com/"},
            "https://s3.example.com/media",
        ),
        (
            {"bucket": "media", "region": "eu-central-1"},
            "https://media.s3.eu-central-1.amazonaws.com",
        ),
    ],
)
def test_base_url(overrides: dict[str, Any], expected: str) -> None:
    assert config(**overrides).base_url == expected


def test_database_settings_win_over_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Настройки из системы важнее переменных: их правит администратор."""

    monkeypatch.setenv("S3_BUCKET", "из-окружения")

    class FakeRow:
        s3_bucket = "из-базы"
        s3_endpoint_url = None
        s3_region = "auto"
        s3_access_key = "ключ"
        s3_secret_key_enc = None
        s3_public_url = None

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args):
            return FakeRow()

    monkeypatch.setattr("app.db.session.SessionLocal", FakeSession)
    assert storage.resolve_config().bucket == "из-базы"


@pytest.mark.parametrize(
    ("endpoint", "expected"),
    [
        # Панель Cloudflare R2 показывает адрес вместе с именем бакета —
        # скопированный как есть, он давал путь /albina/albina/файл.
        ("https://acc.r2.cloudflarestorage.com/albina", "https://acc.r2.cloudflarestorage.com"),
        ("https://acc.r2.cloudflarestorage.com/albina/", "https://acc.r2.cloudflarestorage.com"),
        ("https://acc.r2.cloudflarestorage.com", "https://acc.r2.cloudflarestorage.com"),
        # Чужое имя в пути не наше дело: у MinIO так бывает законно.
        (
            "https://acc.r2.cloudflarestorage.com/other",
            "https://acc.r2.cloudflarestorage.com/other",
        ),
    ],
)
def test_bucket_name_is_stripped_from_endpoint(endpoint: str, expected: str) -> None:
    assert config(bucket="albina", endpoint_url=endpoint).endpoint_url == expected
