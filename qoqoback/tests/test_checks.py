"""Предупреждение о списке разрешённых источников.

Неверный CORS_ORIGINS в браузере выглядит так же, как упавшее приложение:
«нет заголовка Access-Control-Allow-Origin». Отличить нельзя, поэтому о
расхождении сообщаем при запуске.
"""

import pytest

from app.core.checks import cors_problem, origin_of
from app.core.config import Settings


def настройки(**поля: str) -> Settings:
    return Settings(_env_file=None, **поля)


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("https://qoqo.com.kz", "https://qoqo.com.kz"),
        ("https://qoqo.com.kz/", "https://qoqo.com.kz"),
        ("https://qoqo.com.kz/app/orders", "https://qoqo.com.kz"),
        ("http://localhost:5173", "http://localhost:5173"),
        ("  https://qoqo.com.kz  ", "https://qoqo.com.kz"),
    ],
)
def test_origin_is_scheme_host_port(given: str, expected: str) -> None:
    assert origin_of(given) == expected


def test_matching_origin_passes() -> None:
    s = настройки(frontend_url="https://qoqo.com.kz", cors_origins="https://qoqo.com.kz")
    assert cors_problem(s) is None


def test_site_missing_from_list_is_reported() -> None:
    # Ровно случай, случившийся на проде: список остался с localhost.
    s = настройки(frontend_url="https://qoqo.com.kz", cors_origins="http://localhost:5173")
    problem = cors_problem(s)
    assert problem is not None
    assert "qoqo.com.kz" in problem


def test_empty_list_is_reported() -> None:
    s = настройки(frontend_url="https://qoqo.com.kz", cors_origins="")
    assert cors_problem(s) is not None


def test_trailing_slash_in_list_is_reported() -> None:
    """Хост верный, но браузер сверяет источник целиком — запись не сработает."""

    s = настройки(frontend_url="https://qoqo.com.kz", cors_origins="https://qoqo.com.kz/")
    problem = cors_problem(s)
    assert problem is not None
    assert "слэшем" in problem


def test_several_origins_one_of_them_matches() -> None:
    s = настройки(
        frontend_url="https://qoqo.com.kz",
        cors_origins="http://localhost:5173,https://qoqo.com.kz",
    )
    assert cors_problem(s) is None


def test_no_frontend_url_means_nothing_to_check() -> None:
    assert cors_problem(настройки(frontend_url="", cors_origins="")) is None
