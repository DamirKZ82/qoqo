"""Проверки настроек при старте.

Неверный список разрешённых источников не виден ниоткуда, кроме браузера, — и
там он выглядит ровно так же, как упавшее приложение: «нет заголовка
Access-Control-Allow-Origin». Отличить одно от другого по ответу нельзя,
поэтому о расхождении сообщаем сами, при запуске.
"""

from urllib.parse import urlsplit

from app.core.config import Settings


def origin_of(value: str) -> str:
    """Источник в том виде, в каком его присылает браузер: схема, хост, порт.

    Путь и завершающий слэш отбрасываем: сравнение источников точное, и
    `https://qoqo.com.kz/` не совпадёт с `https://qoqo.com.kz` никогда.
    """

    части = urlsplit(value.strip())
    if not части.scheme or not части.netloc:
        return value.strip().rstrip("/")
    return f"{части.scheme}://{части.netloc}"


def cors_problem(settings: Settings) -> str | None:
    """Текст предупреждения о списке источников или None, если всё в порядке."""

    if not settings.frontend_url.strip():
        return None

    сайт = origin_of(settings.frontend_url)
    разрешённые = settings.cors_origins_list

    if any(origin_of(item) == сайт for item in разрешённые):
        # Источник разрешён. Но запись с путём или слэшем браузер не примет,
        # даже когда хост в ней верный.
        # Сравниваем запись как есть с её источником: срезать слэш перед
        # сравнением нельзя — тогда лишний слэш никогда не найдётся.
        неточные = [item for item in разрешённые if item.strip() != origin_of(item)]
        if неточные:
            return (
                "В CORS_ORIGINS есть записи с лишним путём или слэшем: "
                f"{', '.join(неточные)}. Браузер сверяет источник целиком, "
                "поэтому такие записи не сработают"
            )
        return None

    return (
        f"Домен сайта {сайт} не входит в CORS_ORIGINS ({settings.cors_origins or 'пусто'}). "
        "Браузер заблокирует запросы к API, а в консоли это выглядит как отсутствие "
        "заголовка Access-Control-Allow-Origin — неотличимо от упавшего приложения"
    )
