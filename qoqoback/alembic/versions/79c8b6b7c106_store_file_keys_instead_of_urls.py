"""store file keys instead of urls

Revision ID: 79c8b6b7c106
Revises: e68d862e2cf2
Create Date: 2026-08-06 10:20:00.000000

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "79c8b6b7c106"
down_revision: str | Sequence[str] | None = "e68d862e2cf2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Раньше в базе хранился готовый адрес файла. Из-за этого смена публичного
# адреса бакета или переезд в другое хранилище не чинили уже загруженное:
# адрес застывал в записи, и картинки приходилось заливать заново. Теперь
# хранится имя внутри хранилища, а адрес собирается при чтении.
#
# Обратной операции нет: чтобы вернуть адреса, пришлось бы знать, каким было
# хранилище на момент загрузки. Откат оставляет имена как есть — старый код
# считал бы их относительными путями и всё равно не нашёл бы файлы.


# Срезаем только те начала, которыми адреса действительно собирались. Общее
# правило вида «хост и первый сегмент пути» здесь не годится: у публичного
# адреса R2 (`pub-xxx.r2.dev`) имени бакета в пути нет, и такое правило съело бы
# каталог, превратив `products/a.png` в `a.png`.
def префиксы(conn: sa.Connection) -> list[str]:
    строка = (
        conn.execute(
            sa.text("SELECT s3_bucket, s3_endpoint_url, s3_public_url FROM app_settings LIMIT 1")
        )
        .mappings()
        .first()
    )

    начала = ["/media/"]
    if строка:
        бакет = (строка["s3_bucket"] or "").strip()
        адрес = (строка["s3_endpoint_url"] or "").strip().rstrip("/")
        публичный = (строка["s3_public_url"] or "").strip().rstrip("/")
        if публичный:
            начала.append(f"{публичный}/")
        if адрес and бакет:
            начала.append(f"{адрес}/{бакет}/")
        if бакет:
            # Адрес по умолчанию для AWS, если его так и не задали явно.
            начала.append(f"https://{бакет}.s3.")

    # Сначала длинные: иначе короткое начало отрежет только часть.
    return sorted(начала, key=len, reverse=True)


# Поля с одиночным адресом: таблица, колонка.
ПОЛЯ = (
    ("app_settings", "logo_url"),
    ("app_settings", "logo_dark_url"),
    ("app_settings", "favicon_url"),
    ("nomenclature", "image_url"),
    ("news_posts", "cover_url"),
)

# Поля с адресами внутри JSON: там картинки блоков главной и переводы.
ПОЛЯ_JSON = (
    ("content_blocks", "payload"),
    ("content_blocks", "translations"),
    ("news_posts", "translations"),
)


def в_имя(value: str | None, начала: list[str]) -> str | None:
    """Оставляет от адреса имя внутри хранилища."""

    if not value:
        return value
    for начало in начала:
        if value.startswith(начало):
            остаток = value[len(начало) :]
            # Для адреса AWS по умолчанию отрезаем ещё и хвост хоста.
            if начало.startswith("https://") and начало.endswith(".s3."):
                остаток = остаток.split("/", 1)[1] if "/" in остаток else остаток
            return остаток
    return value


def обойти_json(данные: object, начала: list[str]) -> object:
    """Переписывает адреса файлов внутри произвольной структуры.

    Состав блоков главной задаёт человек, и заранее известны не все ключи —
    поэтому идём по всему дереву, а трогаем только строки, похожие на адрес
    загруженного файла.
    """

    if isinstance(данные, dict):
        return {k: обойти_json(v, начала) for k, v in данные.items()}
    if isinstance(данные, list):
        return [обойти_json(v, начала) for v in данные]
    if isinstance(данные, str):
        return в_имя(данные, начала)
    return данные


def upgrade() -> None:
    """Upgrade schema."""

    conn = op.get_bind()
    начала = префиксы(conn)

    for таблица, колонка in ПОЛЯ:
        строки = conn.execute(
            sa.text(f"SELECT id, {колонка} FROM {таблица} WHERE {колонка} IS NOT NULL")
        ).all()
        for идентификатор, значение in строки:
            новое = в_имя(значение, начала)
            if новое != значение:
                conn.execute(
                    sa.text(f"UPDATE {таблица} SET {колонка} = :v WHERE id = :i"),
                    {"v": новое, "i": идентификатор},
                )

    for таблица, колонка in ПОЛЯ_JSON:
        строки = conn.execute(
            sa.text(f"SELECT id, {колонка} FROM {таблица} WHERE {колонка} IS NOT NULL")
        ).all()
        for идентификатор, значение in строки:
            новое = обойти_json(значение, начала)
            if новое != значение:
                conn.execute(
                    sa.text(f"UPDATE {таблица} SET {колонка} = CAST(:v AS jsonb) WHERE id = :i"),
                    {"v": json.dumps(новое, ensure_ascii=False), "i": идентификатор},
                )


def downgrade() -> None:
    """Downgrade schema."""

    # Восстановить адреса нечем: хранилище на момент загрузки неизвестно.
