from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class SettingsRead(ORMModel):
    company_name: str
    legal_name: str | None
    phone: str | None
    email: str | None
    address: str | None
    logo_url: str | None
    logo_dark_url: str | None
    favicon_url: str | None
    primary_color: str
    accent_color: str
    hero_title: str | None
    hero_subtitle: str | None


class SettingsWrite(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    legal_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    primary_color: str = Field(default="#00533B", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: str = Field(default="#D4AF37", pattern=r"^#[0-9A-Fa-f]{6}$")
    hero_title: str | None = None
    hero_subtitle: str | None = None


# --- Почта ---------------------------------------------------------------


class MailSettingsRead(BaseModel):
    """Настройки почты для экрана администратора.

    Пароля здесь нет намеренно: отдавать его обратно значит показывать
    рабочий пароль ящика каждому, кто открыл настройки, и оставлять его в
    журналах браузера. Вместо значения — признак, что оно задано.
    """

    smtp_host: str | None
    smtp_port: int
    smtp_user: str | None
    smtp_from: str | None
    smtp_use_tls: bool
    smtp_use_ssl: bool
    password_set: bool
    # Когда почта не настроена, ссылка-приглашение возвращается в ответе API,
    # и администратор передаёт её сам. Экрану нужно об этом сказать.
    configured: bool


class MailSettingsWrite(BaseModel):
    smtp_host: str | None = Field(default=None, max_length=200)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str | None = Field(default=None, max_length=200)
    # Пустое значение означает «оставить прежний»: иначе пароль стирался бы
    # при каждом сохранении формы, ведь обратно мы его не отдаём.
    smtp_password: str | None = Field(default=None, max_length=500)
    smtp_from: str | None = Field(default=None, max_length=200)
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False


class MailTestResult(BaseModel):
    sent: bool
    detail: str
