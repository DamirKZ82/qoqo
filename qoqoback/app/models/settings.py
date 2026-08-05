import uuid

from sqlalchemy import Boolean, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin

# Настройки хранятся одной строкой с фиксированным идентификатором.
SETTINGS_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class AppSettings(TimestampMixin, Base):
    """Настройки системы: брендирование и контакты в шапке сайта."""

    __tablename__ = "app_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=SETTINGS_ID)

    company_name: Mapped[str] = mapped_column(String(200), default="QoQo", nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(500))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(1000))

    # Путь к загруженному логотипу вида /media/branding/<файл>.
    # Пусто — используется логотип, встроенный во фронтенд.
    logo_url: Mapped[str | None] = mapped_column(String(500))
    # Отдельный логотип для тёмной шапки; если пусто — берётся основной.
    logo_dark_url: Mapped[str | None] = mapped_column(String(500))
    favicon_url: Mapped[str | None] = mapped_column(String(500))

    primary_color: Mapped[str] = mapped_column(String(7), default="#00533B", nullable=False)
    accent_color: Mapped[str] = mapped_column(String(7), default="#D4AF37", nullable=False)

    hero_title: Mapped[str | None] = mapped_column(String(300))
    hero_subtitle: Mapped[str | None] = mapped_column(String(1000))

    # Почта для приглашений. Здесь, а не только в переменных окружения:
    # заводит сотрудников администратор, и упираться при этом в доступ к
    # настройкам развёртывания он не должен. Пустой smtp_host — письма не
    # отправляются, а ссылка возвращается в ответе API.
    smtp_host: Mapped[str | None] = mapped_column(String(200))
    smtp_port: Mapped[int] = mapped_column(Integer, default=587, nullable=False)
    smtp_user: Mapped[str | None] = mapped_column(String(200))
    # Пароль чужой — им пользуются, значит хешировать нельзя. Лежит
    # зашифрованным на ключе из SECRET_KEY: см. app/core/secrets.py.
    smtp_password_enc: Mapped[str | None] = mapped_column(String(500))
    smtp_from: Mapped[str | None] = mapped_column(String(200))
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    smtp_use_ssl: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
