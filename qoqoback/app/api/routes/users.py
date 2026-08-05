import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.api.routes.auth import user_payload
from app.core.deps import CurrentUser, DbSession, require_roles
from app.models import User, UserRole
from app.schemas.auth import UserCreated, UserRead, UserWrite
from app.schemas.common import Page
from app.services.invitations import build_link, create_invitation, send_invitation

router = APIRouter(prefix="/users", tags=["Сотрудники"])

admin_only = Depends(require_roles(UserRole.ADMIN))

# Пароль, под которым нельзя войти: до принятия приглашения у сотрудника его нет.
UNUSABLE_PASSWORD = "!"


@router.get("", response_model=Page[UserRead])
def list_users(
    db: DbSession,
    _: CurrentUser,
    search: str | None = None,
    only_active: bool = True,
    # Отбор по роли нужен там, где выбирают из сотрудников одного вида:
    # закрепление торгового за точкой, назначение представителя на маршрут.
    role: UserRole | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Any:
    stmt = select(User)
    if only_active:
        stmt = stmt.where(User.is_active.is_(True))
    if role is not None:
        stmt = stmt.where(User.role == role)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = (
        db.execute(stmt.order_by(User.full_name).limit(limit).offset(offset))
        .unique()
        .scalars()
        .all()
    )
    return Page(items=[user_payload(row) for row in rows], total=total, limit=limit, offset=offset)


@router.post("", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserWrite,
    db: DbSession,
    admin: CurrentUser,
    # Адрес сайта берём из запроса: администратор заводит сотрудника из
    # браузера, значит адрес известен точно и переменную можно не задавать.
    origin: Annotated[str | None, Header()] = None,
) -> UserCreated:
    """Заводит сотрудника и отправляет приглашение.

    Пароль здесь не задаётся: сотрудник получает письмо и устанавливает его сам.
    """

    if admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Сотрудников заводит администратор",
        )

    user = User(
        email=payload.email.strip().lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        hashed_password=UNUSABLE_PASSWORD,
        role=payload.role,
        is_active=payload.is_active,
        organization_id=payload.organization_id,
        division_id=payload.division_id,
        warehouse_id=payload.warehouse_id,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сотрудник с такой почтой уже есть",
        ) from exc

    _, raw_token = create_invitation(db, user=user, created_by=admin)
    db.commit()
    db.refresh(user)

    sent = send_invitation(user, raw_token, origin)
    return UserCreated(
        user=UserRead.model_validate(user_payload(user)),
        invitation_sent=sent,
        invitation_link=None if sent else build_link(raw_token, origin),
    )


@router.post("/{user_id}/invite", response_model=UserCreated)
def resend_invitation(
    user_id: uuid.UUID,
    db: DbSession,
    admin: CurrentUser,
    origin: Annotated[str | None, Header()] = None,
) -> UserCreated:
    """Повторно отправляет приглашение — прошлая ссылка при этом гасится."""

    if admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Приглашения отправляет администратор",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")

    _, raw_token = create_invitation(db, user=user, created_by=admin)
    db.commit()

    sent = send_invitation(user, raw_token, origin)
    return UserCreated(
        user=UserRead.model_validate(user_payload(user)),
        invitation_sent=sent,
        invitation_link=None if sent else build_link(raw_token, origin),
    )


@router.put("/{user_id}", response_model=UserRead)
def update_user(user_id: uuid.UUID, payload: UserWrite, db: DbSession, _: Any = admin_only) -> Any:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")

    user.email = payload.email.strip().lower()
    user.full_name = payload.full_name
    user.phone = payload.phone
    user.role = payload.role
    user.is_active = payload.is_active
    user.organization_id = payload.organization_id
    user.division_id = payload.division_id
    user.warehouse_id = payload.warehouse_id

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сотрудник с такой почтой уже есть",
        ) from exc
    db.refresh(user)
    return user_payload(user)
