"""Настройки почты в системе.

Главное здесь — пароль от чужого ящика: им пользуются, значит хешировать
нельзя, и он не должен ни возвращаться наружу, ни лежать в базе открытым.
"""

import pytest

from app.core.secrets import decrypt, encrypt
from app.schemas.settings import MailSettingsRead, MailSettingsWrite


def test_password_survives_round_trip() -> None:
    assert decrypt(encrypt("пароль ящика")) == "пароль ящика"


def test_stored_value_does_not_contain_the_password() -> None:
    """Смысл шифрования: дамп базы не даёт рабочий пароль."""

    сохранённое = encrypt("Пароль-Ящика-2026")
    assert "Пароль-Ящика-2026" not in сохранённое


def test_unreadable_value_does_not_raise() -> None:
    """Смена SECRET_KEY делает сохранённое нечитаемым — но не ломает работу."""

    assert decrypt("gAAAAABmэто-не-шифротекст") == ""
    assert decrypt(None) == ""


def test_read_schema_has_no_password_field() -> None:
    # Проверяем состав схемы, а не конкретный ответ: поле нельзя добавить
    # случайно, не уронив этот тест.
    поля = set(MailSettingsRead.model_fields)
    assert "smtp_password" not in поля
    assert "smtp_password_enc" not in поля
    assert "password_set" in поля


@pytest.mark.parametrize("port", [0, 65536, -1])
def test_port_out_of_range_is_rejected(port: int) -> None:
    with pytest.raises(ValueError):
        MailSettingsWrite(smtp_host="smtp.example.com", smtp_port=port)


def test_defaults_match_common_setup() -> None:
    write = MailSettingsWrite()
    assert (write.smtp_port, write.smtp_use_tls, write.smtp_use_ssl) == (587, True, False)
