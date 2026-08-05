import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.mail import send_invitation_email
from app.models import InvitationPurpose, User, UserInvitation


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def link_base(origin: str | None = None) -> str:
    """Адрес сайта, из которого собирается ссылка приглашения.

    Сначала берём источник запроса: сотрудника заводит администратор, открывший
    систему в браузере, — значит адрес её сайта известен точно. FRONTEND_URL
    остаётся запасным вариантом: он нужен там, где запроса нет вовсе — в
    сид-скрипте и в консольной выдаче приглашения.

    Так забытая переменная не приводит к ссылке на localhost в письме
    сотруднику, а именно это и случилось на боевом контуре.

    Источник принимаем только из списка разрешённых. Иначе подделанный
    заголовок Origin увёл бы ссылку с одноразовым токеном на чужой сайт —
    приглашения выписывает администратор, но проверять его на внимательность
    здесь незачем.
    """

    settings = get_settings()

    if origin:
        источник = origin.strip().rstrip("/")
        разрешённые = {item.strip().rstrip("/") for item in settings.cors_origins_list}
        if источник in разрешённые:
            return источник

    return settings.frontend_url.rstrip("/")


def build_link(raw_token: str, origin: str | None = None) -> str:
    return f"{link_base(origin)}/set-password?token={quote(raw_token)}"


def create_invitation(
    db: Session,
    *,
    user: User,
    created_by: User | None = None,
    purpose: InvitationPurpose = InvitationPurpose.INVITE,
) -> tuple[UserInvitation, str]:
    """Создаёт приглашение и возвращает его вместе с «сырым» токеном.

    Сырой токен существует только в этот момент — дальше он уходит в письмо,
    а в базе остаётся лишь его хэш.
    """

    settings = get_settings()

    # Прошлые неиспользованные ссылки этого сотрудника гасим: активной должна
    # оставаться только последняя.
    stale = db.execute(
        select(UserInvitation)
        .where(UserInvitation.user_id == user.id)
        .where(UserInvitation.accepted_at.is_(None))
    ).scalars()
    for item in stale:
        item.expires_at = datetime.now(UTC)

    raw_token = secrets.token_urlsafe(32)
    invitation = UserInvitation(
        user_id=user.id,
        email=user.email,
        token_hash=hash_token(raw_token),
        purpose=purpose,
        expires_at=datetime.now(UTC) + timedelta(hours=settings.invite_expire_hours),
        created_by_id=created_by.id if created_by else None,
    )
    db.add(invitation)
    db.flush()
    return invitation, raw_token


def send_invitation(user: User, raw_token: str, origin: str | None = None) -> bool:
    settings = get_settings()
    return send_invitation_email(
        to=user.email,
        full_name=user.full_name,
        link=build_link(raw_token, origin),
        expires_hours=settings.invite_expire_hours,
    )


def find_valid_invitation(db: Session, raw_token: str) -> UserInvitation | None:
    invitation = (
        db.execute(select(UserInvitation).where(UserInvitation.token_hash == hash_token(raw_token)))
        .unique()
        .scalar_one_or_none()
    )

    if invitation is None or invitation.accepted_at is not None:
        return None

    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        return None

    return invitation
