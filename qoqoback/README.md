# qoqoback

Бэкенд на FastAPI.

## Стек

- Python 3.12, FastAPI, Pydantic v2
- SQLAlchemy 2.0 (синхронный движок) + Alembic
- PostgreSQL через psycopg3
- ruff, pytest

> Слой БД синхронный намеренно: на Windows асинхронный psycopg несовместим с
> `ProactorEventLoop`, который asyncio использует по умолчанию. FastAPI выполняет
> синхронные зависимости в пуле потоков.

## Запуск

```bash
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
cp .env.example .env   # и подставить пароль от PostgreSQL
.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

API поднимется на http://localhost:8000, документация — на http://localhost:8000/docs.

## Миграции

```bash
.venv/Scripts/alembic.exe revision --autogenerate -m "описание"
.venv/Scripts/alembic.exe upgrade head
```

Модели складывать в `app/models/` и импортировать в `app/models/__init__.py`,
иначе автогенерация их не увидит.

## Проверки

```bash
.venv/Scripts/ruff.exe check . && .venv/Scripts/ruff.exe format --check .
.venv/Scripts/python.exe -m pytest -q
```

## Структура

| Путь | Назначение |
| --- | --- |
| `app/main.py` | Сборка приложения, CORS, подключение роутеров |
| `app/core/config.py` | Настройки из `.env` |
| `app/api/router.py` | Корневой роутер `/api/v1` |
| `app/api/routes/` | Эндпоинты |
| `app/db/` | Движок, сессии, базовый класс моделей |
| `app/models/` | ORM-модели |
| `alembic/` | Миграции |
| `tests/` | Тесты |
