import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.error_log import LogLevel, LogSource
from app.schemas.common import ORMModel


class ErrorLogRead(ORMModel):
    id: uuid.UUID
    created_at: datetime
    source: LogSource
    level: LogLevel
    message: str
    detail: str | None
    request_id: str | None
    method: str | None
    path: str | None
    status_code: int | None
    user_id: uuid.UUID | None
    user_name: str | None = None
    user_agent: str | None
    context: dict[str, Any] | None


class ClientErrorReport(BaseModel):
    """Сообщение об ошибке из браузера."""

    message: str = Field(min_length=1, max_length=1000)
    detail: str | None = Field(default=None, max_length=20_000)
    path: str | None = Field(default=None, max_length=500)
    context: dict[str, Any] | None = None


class ErrorLogStats(BaseModel):
    total: int
    last_24h: int
    server: int
    client: int
