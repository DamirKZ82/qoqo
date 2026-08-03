# qoqo

Монорепозиторий проекта qoqo.

| Каталог | Что там | Стек |
| --- | --- | --- |
| [`qoqoback/`](qoqoback) | Бэкенд, REST API | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL |
| [`qoqofront/`](qoqofront) | Фронтенд, SPA | React 19, TypeScript, Vite, Material UI v9 |

## Быстрый старт

Нужны PostgreSQL с базой `qoqo`, Python 3.12 и Node.js 20+.

Бэкенд:

```bash
cd qoqoback && py -3.12 -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements-dev.txt
```

Скопировать `qoqoback/.env.example` в `qoqoback/.env` и подставить пароль от PostgreSQL, затем:

```bash
cd qoqoback && .venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

Фронтенд (в отдельном терминале):

```bash
cd qoqofront && npm install && npm run dev
```

- Фронтенд: http://localhost:5173
- API: http://localhost:8000, документация — http://localhost:8000/docs

Vite проксирует `/api` на бэкенд, так что настраивать `VITE_API_URL` для разработки не нужно.

Подробности — в [qoqoback/README.md](qoqoback/README.md) и [qoqofront/README.md](qoqofront/README.md).

## Репозиторий

https://github.com/DamirKZ82/qoqo
