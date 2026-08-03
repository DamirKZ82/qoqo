import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(*, to: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    """Отправляет письмо.

    Если SMTP не настроен (в .env пуст SMTP_HOST), письмо не отправляется, а
    содержимое пишется в лог — так разработка не требует почтового сервера,
    и ссылка-приглашение видна в консоли.
    """

    settings = get_settings()

    if not settings.smtp_host:
        logger.warning(
            "SMTP не настроен — письмо не отправлено.\nКому: %s\nТема: %s\n%s",
            to,
            subject,
            text_body,
        )
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from or settings.smtp_user or "noreply@qoqo.kz"
    message["To"] = to
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        if settings.smtp_use_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=20
            )
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            if settings.smtp_use_tls:
                server.starttls()

        with server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
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
