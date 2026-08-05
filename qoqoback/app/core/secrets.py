"""Хранение чужих паролей в базе.

Пароль от почтового ящика — не наш: его нельзя захешировать, потому что им
придётся пользоваться. Значит он лежит в базе в открытом виде, если ничего не
предпринять, и любой, кто получил дамп или доступ к панели базы, забирает
рабочий ящик компании вместе с ним.

Поэтому храним зашифрованным. Ключ выводится из SECRET_KEY, который живёт в
переменных окружения, а не в базе, — одного дампа для расшифровки мало.

Смена SECRET_KEY делает сохранённое нечитаемым. Это не потеря: пароль просто
вводят заново, а вот молчаливая работа со старым ключом была бы хуже.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _cipher() -> Fernet:
    # Fernet требует ключ ровно в 32 байта, а SECRET_KEY — произвольная строка.
    ключ = hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(ключ))


def encrypt(value: str) -> str:
    return _cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt(value: str | None) -> str:
    """Расшифровывает значение. Пустая строка — если прочитать не удалось."""

    if not value:
        return ""
    try:
        return _cipher().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        # Чаще всего это смена SECRET_KEY. Падать нельзя: из-за нечитаемого
        # пароля не должна отваливаться вся работа с настройками.
        logger.error("Не удалось расшифровать сохранённый пароль — задайте его заново")
        return ""
