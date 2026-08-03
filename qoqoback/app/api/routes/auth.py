from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models import ROLE_TITLES, User
from app.schemas.auth import (
    AcceptInvitation,
    InvitationInfo,
    LoginRequest,
    PasswordChange,
    TokenResponse,
    UserRead,
)
from app.services.invitations import find_valid_invitation

router = APIRouter(prefix="/auth", tags=["Авторизация"])


def user_payload(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "role_title": ROLE_TITLES.get(user.role, user.role.value),
        "is_active": user.is_active,
        "organization_id": user.organization_id,
        "division_id": user.division_id,
        "warehouse_id": user.warehouse_id,
    }


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    # Почту сравниваем без учёта регистра — вводят с телефона, часто с автозаглавной.
    stmt = select(User).where(func.lower(User.email) == payload.email.strip().lower())
    user = db.execute(stmt).unique().scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверная почта или пароль",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись отключена",
        )

    settings = get_settings()
    token = create_access_token(str(user.id), {"role": user.role.value})
    return TokenResponse(
        access_token=token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


_INVALID_INVITE = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Ссылка недействительна или уже использована. Запросите новую у администратора.",
)


@router.get("/invitations/{token}", response_model=InvitationInfo)
def read_invitation(token: str, db: DbSession) -> InvitationInfo:
    """Проверяет ссылку из письма. Публичный эндпоинт — сотрудник ещё не вошёл."""

    invitation = find_valid_invitation(db, token)
    if invitation is None:
        raise _INVALID_INVITE

    user = invitation.user
    return InvitationInfo(
        email=user.email,
        full_name=user.full_name,
        role_title=ROLE_TITLES.get(user.role, user.role.value),
        expires_at=invitation.expires_at,
    )


@router.post("/invitations/{token}", response_model=TokenResponse)
def accept_invitation(token: str, payload: AcceptInvitation, db: DbSession) -> TokenResponse:
    """Устанавливает пароль по приглашению и сразу выдаёт токен доступа."""

    invitation = find_valid_invitation(db, token)
    if invitation is None:
        raise _INVALID_INVITE

    user = invitation.user
    user.hashed_password = hash_password(payload.password)
    user.is_active = True
    invitation.accepted_at = datetime.now(UTC)
    db.commit()

    settings = get_settings()
    access_token = create_access_token(str(user.id), {"role": user.role.value})
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> Any:
    return user_payload(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий пароль указан неверно",
        )
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
