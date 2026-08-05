"""Адрес в ссылке приглашения.

Ссылка уходит письмом сотруднику. Адрес в ней должен вести на сайт компании, а
не на localhost из настроек по умолчанию — и не на чужой сайт, если заголовок
запроса подделали.
"""

import pytest

from app.core.config import get_settings
from app.services.invitations import build_link, link_base


@pytest.fixture(autouse=True)
def настройки(monkeypatch: pytest.MonkeyPatch):
    s = get_settings()
    monkeypatch.setattr(s, "cors_origins", "https://qoqo.com.kz,http://localhost:5173")
    monkeypatch.setattr(s, "frontend_url", "http://localhost:5173")
    return s


def test_origin_wins_over_setting() -> None:
    """Ровно случай с прода: переменную забыли, а сайт открыт по своему адресу."""

    assert link_base("https://qoqo.com.kz") == "https://qoqo.com.kz"


def test_trailing_slash_does_not_break_match() -> None:
    assert link_base("https://qoqo.com.kz/") == "https://qoqo.com.kz"


def test_unknown_origin_is_ignored() -> None:
    """Подделанный заголовок не должен увести ссылку с токеном на чужой сайт."""

    assert link_base("https://зло.example") == "http://localhost:5173"


def test_no_origin_falls_back_to_setting() -> None:
    # Так работают сид-скрипт и консольная выдача приглашения: запроса нет.
    assert link_base(None) == "http://localhost:5173"


def test_link_contains_token_and_base() -> None:
    ссылка = build_link("токен-123", "https://qoqo.com.kz")
    assert ссылка.startswith("https://qoqo.com.kz/set-password?token=")
    assert "localhost" not in ссылка
