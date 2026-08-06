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
    """Сохраняет файл и возвращает адрес, по которому его отдавать."""

    config = resolve_config()
    # Имя генерируем сами: пользовательское имя файла в путь не попадает.
    filename = f"{uuid.uuid4().hex}{extension}"

    if config.configured:
        return put_to_bucket(config, f"{subdir}/{filename}", data, content_type)

    target_dir = Path(get_settings().media_root) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_bytes(data)
    return f"/media/{subdir}/{filename}"


def client(config: StorageConfig) -> Any:
    """Клиент бакета.

    Без кэширования: настройки меняются в системе, и живущий клиент отвечал бы
    по старым до перезапуска.
    """

    # boto3 нужен только при работе с бакетом, поэтому импорт локальный.
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=config.endpoint_url or None,
        region_name=config.region or None,
        aws_access_key_id=config.access_key or None,
        aws_secret_access_key=config.secret_key or None,
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
