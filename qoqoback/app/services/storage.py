"""Хранилище загруженных файлов: логотипы, обложки новостей, картинки блоков.

Локальный диск подходит серверу, который никуда не девается между запросами.
На serverless-платформе такого диска нет: файловая система только для чтения,
а всё, что записано за время вызова, исчезает вместе с ним. Поэтому там нужен
S3-совместимый бакет — он включается заполнением `S3_BUCKET`.
"""

import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings

# Кладём надолго: имя файла содержит случайный идентификатор и не переиспользуется.
CACHE_CONTROL = "public, max-age=31536000, immutable"


def save_file(data: bytes, subdir: str, extension: str, content_type: str) -> str:
    """Сохраняет файл и возвращает адрес, по которому его отдавать."""

    settings = get_settings()
    # Имя генерируем сами: пользовательское имя файла в путь не попадает.
    filename = f"{uuid.uuid4().hex}{extension}"

    if settings.s3_bucket:
        return _put_to_bucket(f"{subdir}/{filename}", data, content_type)

    target_dir = Path(settings.media_root) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_bytes(data)
    return f"/media/{subdir}/{filename}"


def public_base_url(settings: Settings) -> str:
    """Адрес, по которому браузер читает файлы бакета."""

    if settings.s3_public_url:
        return settings.s3_public_url.rstrip("/")
    if settings.s3_endpoint_url:
        return f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}"
    return f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com"


@lru_cache
def _client() -> Any:
    # boto3 нужен только при работе с бакетом, поэтому импорт локальный.
    import boto3

    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        region_name=settings.s3_region or None,
        aws_access_key_id=settings.s3_access_key or None,
        aws_secret_access_key=settings.s3_secret_key or None,
    )


def _put_to_bucket(key: str, data: bytes, content_type: str) -> str:
    settings = get_settings()
    _client().put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        CacheControl=CACHE_CONTROL,
    )
    return f"{public_base_url(settings)}/{key}"
