"""Настройки не должны ронять приложение из-за того, как их задали.

Разбор настроек происходит при импорте: необработанная ошибка здесь означает,
что приложение не поднимется вовсе, а платформа покажет лишь «функция упала».
"""

import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    ("variable", "field", "expected"),
    [
        # В панелях облачных платформ переменную часто заводят пустой.
        ("RUN_MIGRATIONS_ON_START", "run_migrations_on_start", False),
        ("SMTP_PORT", "smtp_port", 587),
        ("ACCESS_TOKEN_EXPIRE_MINUTES", "access_token_expire_minutes", 720),
        ("DEBUG", "debug", False),
    ],
)
def test_empty_value_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch, variable: str, field: str, expected: object
) -> None:
    monkeypatch.setenv(variable, "")
    assert getattr(Settings(_env_file=None), field) == expected


def test_blank_value_falls_back_too(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_PORT", "   ")
    assert Settings(_env_file=None).smtp_port == 587


def test_real_value_still_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_PORT", "2525")
    assert Settings(_env_file=None).smtp_port == 2525


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        # Neon, Supabase и облачные панели выдают адрес без драйвера, а
        # SQLAlchemy берёт для такого psycopg2, которого в проекте нет.
        (
            "postgresql://u:p@ep.neon.tech/db?sslmode=require",
            "postgresql+psycopg://u:p@ep.neon.tech/db?sslmode=require",
        ),
        ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
        ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ],
)
def test_database_url_gets_driver(
    monkeypatch: pytest.MonkeyPatch, given: str, expected: str
) -> None:
    monkeypatch.setenv("DATABASE_URL", given)
    assert Settings(_env_file=None).database_url == expected


def test_engine_builds_from_panel_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """Проверяем не строку, а то, ради чего всё затевалось: движок создаётся."""

    from sqlalchemy import create_engine

    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    # Соединение не открывается — создание движка лишь разбирает адрес и
    # подтягивает драйвер, а именно на этом шаге приложение и падало.
    engine = create_engine(Settings(_env_file=None).database_url)
    assert engine.dialect.driver == "psycopg"
