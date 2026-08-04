"""Заведение администратора при старте на пустой базе.

Система закрыта: регистрации нет, сотрудников заводит администратор. На новой
базе администратора нет ни одного, и войти неоткуда — замкнутый круг. Его и
разрывает эта проверка.

Пароль берётся из SEED_OWNER_PASSWORD и задаётся один раз, при первом запуске.
Дальше учётная запись живёт обычной жизнью: пароль меняется в системе, а
переменная больше ни на что не влияет — повторный запуск существующего
администратора не трогает.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User, UserRole

logger = logging.getLogger(__name__)

# Значение из .env.example. Оставленное как есть, оно означает, что пароль не
# задавали — заводить с ним администратора нельзя.
PLACEHOLDER_PASSWORD = "owner12345"

MIN_PASSWORD_LENGTH = 8


def can_sign_in(hashed_password: str | None) -> bool:
    """Можно ли войти с этим значением.

    До принятия приглашения в поле лежит заглушка, а не хеш: bcrypt всегда
    начинается с `$`. Проверяем признак, а не конкретную заглушку, — тогда
    любое нерабочее значение распознаётся одинаково.
    """

    return bool(hashed_password) and hashed_password.startswith("$")


def ensure_owner() -> None:
    """Заводит администратора, если в базе нет ни одного."""

    settings = get_settings()
    email = settings.seed_owner_email.strip().lower()
    password = settings.seed_owner_password

    if not email or not password:
        return

    try:
        with SessionLocal() as db:
            # Проверяем именно администраторов: если их нет, войти в систему
            # некому, даже когда прочие сотрудники заведены.
            has_admin = db.execute(
                select(func.count()).select_from(User).where(User.role == UserRole.ADMIN)
            ).scalar_one()

            if has_admin:
                return

            if password == PLACEHOLDER_PASSWORD or len(password) < MIN_PASSWORD_LENGTH:
                # Пароль из образца конфигурации известен всем, кто видел
                # репозиторий. Администратор с ним — открытая дверь.
                logger.error(
                    "Администратора нет, но SEED_OWNER_PASSWORD не задан или слишком короткий "
                    "(нужно от %s знаков и не значение из .env.example). "
                    "Учётная запись не создана.",
                    MIN_PASSWORD_LENGTH,
                )
                return

            existing = (
                db.execute(select(User).where(func.lower(User.email) == email))
                .unique()
                .scalar_one_or_none()
            )

            if existing is not None:
                # Учётная запись есть, но роль ниже: повышаем, иначе войти
                # администратором по-прежнему нельзя.
                existing.role = UserRole.ADMIN
                existing.is_active = True

                if not can_sign_in(existing.hashed_password):
                    # Приглашение выписали, но пароль так и не задали. Повысить
                    # роль и оставить как есть — значит не решить задачу: войти
                    # по-прежнему будет некому.
                    existing.hashed_password = hash_password(password)
                    logger.warning(
                        "Сотруднику %s выдана роль администратора и задан пароль "
                        "из SEED_OWNER_PASSWORD: войти было некому",
                        email,
                    )
                else:
                    logger.warning(
                        "Сотруднику %s выдана роль администратора: других не было. "
                        "Пароль оставлен прежним",
                        email,
                    )

                db.commit()
                return

            db.add(
                User(
                    email=email,
                    full_name="Администратор",
                    hashed_password=hash_password(password),
                    role=UserRole.ADMIN,
                )
            )
            db.commit()
            # Пароль в журнал не пишем: журнал уходит в архив и в систему сбора.
            logger.warning("Создан администратор %s с паролем из SEED_OWNER_PASSWORD", email)

    except SQLAlchemyError:
        # Чаще всего это отсутствие таблиц: миграции ещё не накатили. Падать
        # нельзя — иначе приложение не поднимется и накатить их будет неоткуда.
        logger.exception("Не удалось проверить наличие администратора")
