import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models import UserRole
from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserRead(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: UserRole
    role_title: str
    is_active: bool
    organization_id: uuid.UUID | None
    division_id: uuid.UUID | None
    warehouse_id: uuid.UUID | None
    # Привязан ли Telegram — панель подсвечивает значок.
    telegram_linked: bool = False


class UserWrite(BaseModel):
    """Реквизиты сотрудника.

    Пароля здесь нет намеренно: учётные записи заводит администратор, а пароль
    сотрудник задаёт сам по ссылке из письма-приглашения.
    """

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = None
    role: UserRole = UserRole.SALES_REP
    is_active: bool = True
    organization_id: uuid.UUID | None = None
    division_id: uuid.UUID | None = None
    warehouse_id: uuid.UUID | None = None


class UserCreated(BaseModel):
    """Ответ на создание сотрудника."""

    user: UserRead
    invitation_sent: bool
    # Ссылка возвращается только когда письмо уйти не смогло (SMTP не настроен),
    # чтобы администратор мог передать её сотруднику вручную.
    invitation_link: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=100)


class InvitationInfo(BaseModel):
    """Что показать на странице установки пароля."""

    email: str
    full_name: str
    # Код роли — подпись собирает клиент на своём языке.
    role: UserRole
    role_title: str
    expires_at: datetime


class AcceptInvitation(BaseModel):
    password: str = Field(min_length=8, max_length=100)
