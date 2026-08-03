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


def build_link(raw_token: str) -> str:
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/set-password?token={quote(raw_token)}"


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


def send_invitation(user: User, raw_token: str) -> bool:
    settings = get_settings()
    return send_invitation_email(
        to=user.email,
        full_name=user.full_name,
        link=build_link(raw_token),
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
