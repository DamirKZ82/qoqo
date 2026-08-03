import logging
import logging.handlers
from contextvars import ContextVar
from pathlib import Path

from app.core.config import get_settings

# Идентификатор запроса виден во всех сообщениях, записанных при его обработке:
# по нему запись в логе связывается с тем, что увидел пользователь.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


FORMAT = "%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s"


def configure_logging() -> None:
    """Настраивает вывод в консоль и в файл с ротацией.

    Вызывается один раз при старте приложения. Повторный вызов ничего не портит:
    обработчики ставятся заново только если их ещё нет.
    """

    settings = get_settings()
    root = logging.getLogger()

    if any(getattr(handler, "_qoqo", False) for handler in root.handlers):
        return

    root.setLevel(settings.log_level.upper())
    formatter = logging.Formatter(FORMAT)
    request_filter = RequestIdFilter()

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    console.addFilter(request_filter)
    console._qoqo = True  # type: ignore[attr-defined]
    root.addHandler(console)

    if settings.log_file:
        path = Path(settings.log_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            path,
            maxBytes=settings.log_max_bytes,
            backupCount=settings.log_backup_count,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.addFilter(request_filter)
        file_handler._qoqo = True  # type: ignore[attr-defined]
        root.addHandler(file_handler)

    # SQL-запросы шумят даже в отладке — оставляем предупреждения и выше.
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
