"""Точка входа для Vercel.

Runtime находит в модуле переменную `app` с ASGI-приложением и обслуживает
через неё все запросы: маршрутизацию делает сам FastAPI, а `vercel.json`
заворачивает сюда весь трафик проекта.

Каталог `api/` лежит рядом с пакетом `app`, поэтому корень проекта
добавляется в путь импорта явно — на платформе рабочий каталог не гарантирован.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app

__all__ = ["app"]
