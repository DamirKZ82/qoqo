"""Выпускает ссылку для установки пароля.

Запуск:  .venv/Scripts/python.exe -m app.scripts.invite <почта>

Если SMTP настроен — письмо уходит адресату; иначе ссылка печатается в консоль.
Прошлые неиспользованные ссылки этого сотрудника гасятся.
"""

import sys

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import User
from app.services.invitations import build_link, create_invitation, send_invitation


def main() -> int:
    if len(sys.argv) < 2:
        print("Укажите почту: python -m app.scripts.invite user@example.com")
        return 2

    email = sys.argv[1].strip().lower()
    settings = get_settings()

    with SessionLocal() as db:
        user = (
            db.execute(select(User).where(func.lower(User.email) == email))
            .unique()
            .scalar_one_or_none()
        )

        if user is None:
            print(f"Сотрудник с почтой {email} не найден.")
            return 1

        _, raw_token = create_invitation(db, user=user)
        db.commit()
        sent = send_invitation(user, raw_token)
        link = build_link(raw_token)

    print(f"Сотрудник: {user.full_name} <{user.email}>")
    if sent:
        print("Письмо отправлено.")
    else:
        print("SMTP не настроен — передайте ссылку вручную:")
    print(f"  {link}")
    print(f"Ссылка действует {settings.invite_expire_hours} ч. и срабатывает один раз.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
