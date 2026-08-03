import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, select

from app.core.deps import DbSession, require_roles
from app.core.security import decode_access_token
from app.models import User, UserRole
from app.models.error_log import ErrorLog, LogLevel, LogSource
from app.schemas.common import Page
from app.schemas.error_log import ClientErrorReport, ErrorLogRead, ErrorLogStats
from app.services.error_log import record_error

router = APIRouter(prefix="/logs", tags=["Журнал ошибок"])

admin_only = Depends(require_roles(UserRole.ADMIN))
optional_bearer = HTTPBearer(auto_error=False)


def serialize(row: ErrorLog, user_names: dict[uuid.UUID, str]) -> dict[str, Any]:
    return {
        "id": row.id,
        "created_at": row.created_at,
        "source": row.source,
        "level": row.level,
        "message": row.message,
        "detail": row.detail,
        "request_id": row.request_id,
        "method": row.method,
        "path": row.path,
        "status_code": row.status_code,
        "user_id": row.user_id,
        "user_name": user_names.get(row.user_id) if row.user_id else None,
        "user_agent": row.user_agent,
        "context": row.context,
    }


@router.post("/client", status_code=status.HTTP_202_ACCEPTED)
def report_client_error(
    payload: ClientErrorReport,
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> dict[str, str]:
    """Принимает ошибку из браузера.

    Авторизация не требуется: интерфейс падает и у неавторизованного посетителя,
    а именно такие поломки важно увидеть. Если токен есть — запись привязывается
    к сотруднику.
    """

    user_id: uuid.UUID | None = None
    if credentials is not None:
        try:
            user_id = uuid.UUID(decode_access_token(credentials.credentials)["sub"])
        except Exception:
            user_id = None

    record_error(
        source=LogSource.CLIENT,
        message=payload.message,
        detail=payload.detail,
        path=payload.path,
        user_id=user_id,
        user_agent=request.headers.get("user-agent"),
        context=payload.context,
    )
    return {"status": "accepted"}


@router.get("", response_model=Page[ErrorLogRead])
def list_logs(
    db: DbSession,
    source: LogSource | None = None,
    level: LogLevel | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: Any = admin_only,
) -> Any:
    stmt = select(ErrorLog)
    if source is not None:
        stmt = stmt.where(ErrorLog.source == source)
    if level is not None:
        stmt = stmt.where(ErrorLog.level == level)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                ErrorLog.message.ilike(pattern),
                ErrorLog.path.ilike(pattern),
                ErrorLog.request_id.ilike(pattern),
            )
        )

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(stmt.order_by(ErrorLog.created_at.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )

    user_ids = {row.user_id for row in rows if row.user_id}
    user_names: dict[uuid.UUID, str] = {}
    if user_ids:
        user_names = {
            user.id: user.full_name
            for user in db.execute(select(User).where(User.id.in_(user_ids))).unique().scalars()
        }

    return Page(
        items=[serialize(row, user_names) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/stats", response_model=ErrorLogStats)
def log_stats(db: DbSession, _: Any = admin_only) -> ErrorLogStats:
    since = datetime.now(UTC) - timedelta(hours=24)
    total = db.execute(select(func.count()).select_from(ErrorLog)).scalar_one()
    last_24h = db.execute(
        select(func.count()).select_from(ErrorLog).where(ErrorLog.created_at >= since)
    ).scalar_one()
    by_source = dict(
        db.execute(select(ErrorLog.source, func.count()).group_by(ErrorLog.source)).all()
    )
    return ErrorLogStats(
        total=total,
        last_24h=last_24h,
        server=by_source.get(LogSource.SERVER.value, 0),
        client=by_source.get(LogSource.CLIENT.value, 0),
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_logs(
    db: DbSession, older_than_days: int = Query(default=0, ge=0), _: Any = admin_only
) -> None:
    """Чистит журнал. По умолчанию — целиком, иначе старше указанного числа дней."""

    stmt = ErrorLog.__table__.delete()
    if older_than_days > 0:
        stmt = stmt.where(ErrorLog.created_at < datetime.now(UTC) - timedelta(days=older_than_days))
    db.execute(stmt)
    db.commit()
