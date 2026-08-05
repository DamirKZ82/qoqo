import logging
import uuid
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from app.core.logging import request_id_var
from app.db.session import SessionLocal
from app.models.error_log import ErrorLog, LogLevel, LogSource

logger = logging.getLogger(__name__)

MAX_MESSAGE = 1000
MAX_DETAIL = 20_000


def record_error(
    *,
    source: LogSource,
    message: str,
    level: LogLevel = LogLevel.ERROR,
    detail: str | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    user_id: uuid.UUID | None = None,
    user_agent: str | None = None,
    context: dict[str, Any] | None = None,
) -> None:
    """Сохраняет запись об ошибке в базу.

    Работает в собственной сессии: сессия запроса к этому моменту может быть уже
    откачена. Сбой записи не должен маскировать исходную ошибку, поэтому он
    только пишется в лог.
    """

    try:
        with SessionLocal() as db:
            db.add(
                ErrorLog(
                    source=source,
                    level=level,
                    message=message[:MAX_MESSAGE],
                    detail=detail[:MAX_DETAIL] if detail else None,
                    request_id=request_id_var.get(),
                    method=method,
                    path=path[:500] if path else None,
                    status_code=status_code,
                    user_id=user_id,
                    user_agent=user_agent[:500] if user_agent else None,
                    context=context,
                )
            )
            db.commit()
    except SQLAlchemyError as exc:
        # Короткой строкой, а не трассировкой. Самая частая причина сбоя здесь —
        # база недоступна или схема не накатана, и тогда падает уже исходный
        # запрос: его трассировка в логе есть. Вторая копия, да ещё с текстом
        # первой внутри параметров запроса, только мешает читать.
        logger.error("Не удалось сохранить запись об ошибке в базу: %s", type(exc).__name__)
