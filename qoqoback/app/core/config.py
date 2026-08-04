from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "qoqo"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/qoqo"
    timezone: str = "Asia/Almaty"

    # На serverless каждый вызов живёт в своём процессе: пул соединений между
    # вызовами не переиспользуется, зато выедает лимит подключений базы.
    # Включается автоматически на Vercel, здесь — принудительно.
    db_null_pool: bool = False

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 720

    # Хранится строкой через запятую — так же, как в .env
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    seed_owner_email: str = "owner@qoqo.kz"
    seed_owner_password: str = "owner12345"

    # Насколько далеко от точки допустима отметка о визите, в метрах.
    # Больше — отметка попадает в отчёт как сделанная не на месте.
    visit_max_distance_m: int = 300

    # Telegram-бот. Пустой tg_token — привязка в интерфейсе не предлагается.
    tg_token: str = ""
    # Имя бота для ссылки t.me/<имя>. Пусто — спросим у самого Telegram.
    tg_bot_username: str = ""
    tg_link_code_ttl_minutes: int = 15
    # Секрет вебхука. Telegram присылает его заголовком, а не в адресе:
    # адреса запросов пишут в свои журналы и nginx, и облачные балансировщики,
    # поэтому секрету в адресе не место. Пусто — вебхук не принимается.
    tg_webhook_secret: str = ""

    # Печатать SQL-запросы. Отдельно от debug — иначе они забивают журнал.
    db_echo: bool = False

    # Логирование. Пустой log_file — писать только в консоль.
    log_level: str = "INFO"
    log_file: str = "logs/qoqo.log"
    log_max_bytes: int = 5 * 1024 * 1024
    log_backup_count: int = 5

    # Каталог для загруженных файлов (логотип и т.п.), раздаётся по /media.
    # Используется, только когда не настроен бакет.
    media_root: str = "media"

    # S3-совместимое хранилище: AWS S3, Cloudflare R2, MinIO и подобные.
    # Пока s3_bucket пуст, файлы лежат на локальном диске. На serverless
    # локального диска, переживающего вызов, нет — бакет там обязателен.
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = "us-east-1"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    # Адрес, по которому файлы читает браузер: CDN или сам бакет.
    s3_public_url: str = ""

    # Адрес фронтенда — из него собираются ссылки в письмах.
    frontend_url: str = "http://localhost:5173"
    invite_expire_hours: int = 72

    # Почта. Если smtp_host пуст, письма не отправляются, а пишутся в лог.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
