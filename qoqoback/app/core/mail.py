import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class MailConfig:
    """Разрешённые настройки почты — из базы либо из окружения."""

    host: str
    port: int
    user: str
    password: str
    sender: str
    use_tls: bool
    use_ssl: bool

    @property
    def configured(self) -> bool:
        return bool(self.host)


def resolve_config() -> MailConfig:
    """Настройки почты: сначала из базы, иначе из переменных окружения.

    База важнее, потому что её правит администратор прямо в системе, а
    переменные — тот, у кого есть доступ к развёртыванию. Окружение остаётся
    запасным вариантом: так уже работающие установки не ломаются, а в
    разработке ничего заводить не нужно.
    """

    settings = get_settings()

    try:
        # Импорт внутри: модели тянут за собой базу, а письма отправляются и
        # там, где её ещё нет, — например при проверке настроек на старте.
        from app.core.secrets import decrypt
        from app.db.session import SessionLocal
        from app.models import SETTINGS_ID, AppSettings

        with SessionLocal() as db:
            строка = db.get(AppSettings, SETTINGS_ID)
            if строка is not None and строка.smtp_host:
                return MailConfig(
                    host=строка.smtp_host,
                    port=строка.smtp_port,
                    user=строка.smtp_user or "",
                    password=decrypt(строка.smtp_password_enc),
                    sender=строка.smtp_from or строка.smtp_user or "",
                    use_tls=строка.smtp_use_tls,
                    use_ssl=строка.smtp_use_ssl,
                )
    except SQLAlchemyError:
        # База недоступна или схема не накатана — не повод не отправить письмо
        # по настройкам из окружения.
        logger.warning("Не удалось прочитать настройки почты из базы, беру из окружения")

    return MailConfig(
        host=settings.smtp_host,
        port=settings.smtp_port,
        user=settings.smtp_user,
        password=settings.smtp_password,
        sender=settings.smtp_from or settings.smtp_user,
        use_tls=settings.smtp_use_tls,
        use_ssl=settings.smtp_use_ssl,
    )


def send_email(*, to: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    """Отправляет письмо.

    Если почта не настроена, письмо не отправляется, а содержимое пишется в
    лог — так разработка не требует почтового сервера, и ссылка-приглашение
    видна в консоли.
    """

    settings = resolve_config()

    if not settings.configured:
        logger.warning(
            "Почта не настроена — письмо не отправлено.\nКому: %s\nТема: %s\n%s",
            to,
            subject,
            text_body,
        )
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.sender or "noreply@qoqo.kz"
    message["To"] = to
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        if settings.use_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(settings.host, settings.port, timeout=20)
        else:
            server = smtplib.SMTP(settings.host, settings.port, timeout=20)
            if settings.use_tls:
                server.starttls()

        with server:
            if settings.user:
                server.login(settings.user, settings.password)
            server.send_message(message)
    except (smtplib.SMTPException, OSError):
        logger.exception("Не удалось отправить письмо на %s", to)
        return False

    return True


def send_invitation_email(*, to: str, full_name: str, link: str, expires_hours: int) -> bool:
    subject = "QoQo — приглашение в систему"
    text_body = (
        f"Здравствуйте, {full_name}!\n\n"
        "Для вас создана учётная запись в системе QoQo.\n"
        f"Установите пароль по ссылке: {link}\n\n"
        f"Ссылка действует {expires_hours} ч. и открывается один раз.\n"
        "Если вы не ожидали это письмо — просто проигнорируйте его."
    )
    html_body = f"""\
<div style="font-family:Arial,sans-serif;color:#333;max-width:520px">
  <h2 style="color:#00533B;margin:0 0 16px">QoQo</h2>
  <p>Здравствуйте, {full_name}!</p>
  <p>Для вас создана учётная запись в системе QoQo.</p>
  <p style="margin:24px 0">
    <a href="{link}"
       style="background:#00533B;color:#fff;padding:12px 24px;border-radius:8px;
              text-decoration:none;display:inline-block">Установить пароль</a>
  </p>
  <p style="color:#666;font-size:13px">
    Ссылка действует {expires_hours} ч. и открывается один раз.<br>
    Если вы не ожидали это письмо — просто проигнорируйте его.
  </p>
</div>"""
    return send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)
