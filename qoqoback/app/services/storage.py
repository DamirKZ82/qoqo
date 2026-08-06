"""Хранилище загруженных файлов: логотипы, обложки новостей, картинки блоков.

Локальный диск подходит серверу, который никуда не девается между запросами.
На serverless-платформе такого диска нет: файловая система только для чтения,
а всё, что записано за время вызова, исчезает вместе с ним. Поэтому там нужен
S3-совместимый бакет — он включается заполнением `S3_BUCKET`.
"""

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Кладём надолго: имя файла содержит случайный идентификатор и не переиспользуется.
CACHE_CONTROL = "public, max-age=31536000, immutable"


@dataclass(slots=True)
class StorageConfig:
    """Разрешённые настройки хранилища — из базы либо из окружения."""

    bucket: str
    endpoint_url: str
    region: str
    access_key: str
    secret_key: str
    public_url: str

    def __post_init__(self) -> None:
        """Приводит адрес хранилища к тому виду, которого ждёт клиент S3.

        В панели Cloudflare R2 рядом с бакетом показан адрес вместе с его
        именем: `https://<аккаунт>.r2.cloudflarestorage.com/<бакет>`. Скопировав
        его как есть, человек получает удвоение — клиент добавляет имя бакета
        сам, и запись уходит на `/<бакет>/<бакет>/файл`. Ошибка при этом
        невнятная, поэтому лишнее имя срезаем молча.
        """

        self.endpoint_url = self.endpoint_url.strip().rstrip("/")
        self.public_url = self.public_url.strip().rstrip("/")
        self.bucket = self.bucket.strip()

        if self.bucket and self.endpoint_url.endswith(f"/{self.bucket}"):
            self.endpoint_url = self.endpoint_url[: -len(f"/{self.bucket}")]

    @property
    def configured(self) -> bool:
        return bool(self.bucket)

    @property
    def base_url(self) -> str:
        """Адрес, по которому браузер читает файлы бакета."""

        if self.public_url:
            return self.public_url.rstrip("/")
        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket}"
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com"


def resolve_config() -> StorageConfig:
    """Настройки хранилища: сначала из базы, иначе из переменных окружения.

    База важнее по той же причине, что и у почты: её правит администратор в
    системе, а переменные — тот, у кого есть доступ к развёртыванию. Окружение
    остаётся запасным вариантом, чтобы уже работающие установки не ломались.
    """

    settings = get_settings()

    try:
        from app.core.secrets import decrypt
        from app.db.session import SessionLocal
        from app.models import SETTINGS_ID, AppSettings

        with SessionLocal() as db:
            строка = db.get(AppSettings, SETTINGS_ID)
            if строка is not None and строка.s3_bucket:
                return StorageConfig(
                    bucket=строка.s3_bucket,
                    endpoint_url=строка.s3_endpoint_url or "",
                    region=строка.s3_region or "",
                    access_key=строка.s3_access_key or "",
                    secret_key=decrypt(строка.s3_secret_key_enc),
                    public_url=строка.s3_public_url or "",
                )
    except SQLAlchemyError:
        logger.warning("Не удалось прочитать настройки хранилища из базы, беру из окружения")

    return StorageConfig(
        bucket=settings.s3_bucket,
        endpoint_url=settings.s3_endpoint_url,
        region=settings.s3_region,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        public_url=settings.s3_public_url,
    )


def save_file(data: bytes, subdir: str, extension: str, content_type: str) -> str:
    """Сохраняет файл и возвращает его имя внутри хранилища.

    Возвращается именно имя (`products/ab12.png`), а не готовый адрес. Адрес
    собирается при чтении — иначе он застывает в базе: сменили публичный адрес
    бакета, переехали на свой домен или в другое хранилище — и все картинки
    приходится загружать заново.
    """

    config = resolve_config()
    # Имя генерируем сами: пользовательское имя файла в путь не попадает.
    filename = f"{uuid.uuid4().hex}{extension}"
    key = f"{subdir}/{filename}"

    if config.configured:
        put_to_bucket(config, key, data, content_type)
        return key

    target_dir = Path(get_settings().media_root) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_bytes(data)
    return key


def media_base_url() -> str:
    """Адрес, из которого собираются ссылки на файлы.

    Пустая строка означает «файлы у самого приложения»: клиент подставит свой
    адрес API и путь `/media`. Так одна и та же запись в базе работает и на
    локальном диске, и в бакете.
    """

    config = resolve_config()
    return config.base_url if config.configured else ""


def client(config: StorageConfig) -> Any:
    """Клиент бакета.

    Без кэширования: настройки меняются в системе, и живущий клиент отвечал бы
    по старым до перезапуска.
    """

    # boto3 нужен только при работе с бакетом, поэтому импорт локальный.
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=config.endpoint_url or None,
        region_name=config.region or None,
        aws_access_key_id=config.access_key or None,
        aws_secret_access_key=config.secret_key or None,
        config=Config(
            signature_version="s3v4",
            # Начиная с boto3 1.36 клиент добавляет к загрузке контрольную
            # сумму и передаёт тело кусками. AWS это понимает, а Cloudflare R2,
            # MinIO и прочие совместимые хранилища — нет: они отвечают
            # «подпись не совпала», и человек идёт проверять ключи, с которыми
            # всё в порядке. Считаем сумму только там, где её требуют.
            request_checksum_calculation="when_required",
            response_checksum_validation="when_supported",
        ),
    )


def put_to_bucket(config: StorageConfig, key: str, data: bytes, content_type: str) -> str:
    client(config).put_object(
        Bucket=config.bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        CacheControl=CACHE_CONTROL,
    )
    return f"{config.base_url}/{key}"


def check_readable(key: str) -> tuple[bool, str]:
    """Открывается ли файл обычным запросом, как из браузера.

    Успешной загрузки мало. У Cloudflare R2 бакеты закрыты по умолчанию, и
    файл, лежащий в хранилище, для страницы всё равно не существует. Разницу
    между «загрузилось» и «видно посетителю» человек иначе узнаёт только по
    битой картинке.
    """

    import httpx

    config = resolve_config()
    if not config.configured:
        # Локальный диск раздаёт само приложение — проверять нечего.
        return True, ""

    if not config.public_url:
        return False, (
            "адрес для браузера не указан, а адрес хранилища требует подписи. "
            "Откройте бакету публичный доступ и впишите его адрес в настройках"
        )

    try:
        r = httpx.get(f"{config.base_url}/{key}", timeout=15, follow_redirects=True)
    except Exception as exc:
        return False, f"файл не запрашивается: {type(exc).__name__}"

    if r.status_code == 200:
        return True, ""
    return False, f"хранилище ответило {r.status_code}. Проверьте публичный доступ к бакету"
