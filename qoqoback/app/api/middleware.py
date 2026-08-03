import logging
import time
import traceback
import uuid

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from app.core.logging import request_id_var
from app.models.error_log import LogSource
from app.services.error_log import record_error

logger = logging.getLogger("app.request")

# Заголовок с идентификатором запроса: клиент показывает его в сообщении об
# ошибке, чтобы по нему можно было найти запись в логе.
REQUEST_ID_HEADER = "X-Request-Id"

# Медленный запрос — повод посмотреть, что происходит.
SLOW_REQUEST_SECONDS = 3.0

MAX_REQUEST_ID_LENGTH = 36


def _safe_request_id(incoming: str | None) -> str:
    """Принимает идентификатор от клиента, если его можно вернуть в заголовке.

    Значения заголовков кодируются latin-1, поэтому чужой идентификатор с
    кириллицей или эмодзи уронил бы ответ при попытке его вернуть. Такое
    значение отбрасываем и выдаём своё.
    """

    if not incoming:
        return uuid.uuid4().hex[:16]

    candidate = incoming.strip()[:MAX_REQUEST_ID_LENGTH]
    if not candidate.isascii() or not candidate.isprintable():
        return uuid.uuid4().hex[:16]
    return candidate


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Идентификатор запроса, замер времени и разбор необработанных ошибок."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = _safe_request_id(request.headers.get(REQUEST_ID_HEADER))
        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed = time.perf_counter() - started
            logger.exception(
                "Необработанная ошибка %s %s за %.0f мс",
                request.method,
                request.url.path,
                elapsed * 1000,
            )
            record_error(
                source=LogSource.SERVER,
                message=f"{type(exc).__name__}: {exc}",
                detail=traceback.format_exc(),
                method=request.method,
                path=request.url.path,
                status_code=HTTP_500_INTERNAL_SERVER_ERROR,
                user_agent=request.headers.get("user-agent"),
            )
            # Наружу отдаём только идентификатор: подробности ошибки — в логе.
            return JSONResponse(
                status_code=HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "detail": "Внутренняя ошибка сервера. Сообщите администратору код запроса.",
                    "request_id": request_id,
                },
                headers={REQUEST_ID_HEADER: request_id},
            )
        finally:
            request_id_var.reset(token)

        elapsed = time.perf_counter() - started
        response.headers[REQUEST_ID_HEADER] = request_id

        if response.status_code >= 500:
            logger.error(
                "%s %s -> %s за %.0f мс",
                request.method,
                request.url.path,
                response.status_code,
                elapsed * 1000,
            )
        elif elapsed > SLOW_REQUEST_SECONDS:
            logger.warning(
                "Медленный запрос %s %s -> %s за %.0f мс",
                request.method,
                request.url.path,
                response.status_code,
                elapsed * 1000,
            )
        else:
            logger.debug(
                "%s %s -> %s за %.0f мс",
                request.method,
                request.url.path,
                response.status_code,
                elapsed * 1000,
            )

        return response
