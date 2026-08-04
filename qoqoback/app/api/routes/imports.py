import io
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbSession
from app.models import EDITOR_ROLES, Nomenclature, Warehouse
from app.models.stock import StockDocument, StockDocumentLine, StockDocumentType
from app.services import imports, stock
from app.services.imports import COLUMNS, KIND_TITLES, ImportKind

router = APIRouter(prefix="/imports", tags=["Импорт данных"])

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5000


class ColumnInfo(BaseModel):
    key: str
    title: str
    required: bool
    hint: str | None


class RowInfo(BaseModel):
    line: int
    values: dict[str, Any]
    errors: list[str]
    action: str


class ImportPreview(BaseModel):
    kind: ImportKind
    kind_title: str
    columns: list[ColumnInfo]
    rows: list[RowInfo]
    total: int
    valid: int
    invalid: int
    to_create: int
    to_update: int


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    message: str


def _require_editor(user: Any) -> None:
    if user.role not in EDITOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Импорт доступен администратору, директору и бухгалтеру",
        )


def _read_upload(file: UploadFile) -> bytes:
    content = file.file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл больше 10 МБ",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Файл пустой")
    return content


def _build_preview(db: DbSession, kind: ImportKind, content: bytes, filename: str) -> ImportPreview:
    try:
        raw = imports.read_table(content, filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Не удалось прочитать файл. Ожидается XLSX или CSV.",
        ) from exc

    if len(raw) > MAX_ROWS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"В файле больше {MAX_ROWS} строк — разбейте его на части",
        )

    rows = imports.parse(db, kind, raw)

    return ImportPreview(
        kind=kind,
        kind_title=KIND_TITLES[kind],
        columns=[
            ColumnInfo(key=c.key, title=c.title, required=c.required, hint=c.hint)
            for c in COLUMNS[kind]
        ],
        rows=[
            RowInfo(line=r.line, values=_plain(r.values), errors=r.errors, action=r.action)
            for r in rows
        ],
        total=len(rows),
        valid=sum(1 for r in rows if r.valid),
        invalid=sum(1 for r in rows if not r.valid),
        to_create=sum(1 for r in rows if r.valid and r.action == "create"),
        to_update=sum(1 for r in rows if r.valid and r.action == "update"),
    )


def _plain(values: dict[str, Any]) -> dict[str, Any]:
    """Decimal в строку: JSON их не понимает, а точность терять нельзя."""

    return {
        key: (str(value) if isinstance(value, Decimal) else value) for key, value in values.items()
    }


@router.get("/kinds", response_model=list[dict])
def list_kinds() -> list[dict]:
    return [
        {
            "kind": kind.value,
            "title": KIND_TITLES[kind],
            "columns": [
                {"key": c.key, "title": c.title, "required": c.required, "hint": c.hint}
                for c in COLUMNS[kind]
            ],
        }
        for kind in ImportKind
    ]


@router.get("/template/{kind}")
def download_template(kind: ImportKind) -> StreamingResponse:
    """Пустой файл-образец со всеми колонками.

    Разделитель «;» и BOM — иначе Excel открывает кириллицу кракозябрами.
    """

    titles = [column.title for column in COLUMNS[kind]]
    buffer = io.StringIO()
    buffer.write("﻿")
    buffer.write(";".join(titles) + "\r\n")

    return StreamingResponse(
        io.BytesIO(buffer.getvalue().encode("utf-8")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="qoqo-{kind.value}.csv"'},
    )


@router.post("/{kind}/preview", response_model=ImportPreview)
def preview(
    kind: ImportKind, db: DbSession, user: CurrentUser, file: UploadFile = File(...)
) -> ImportPreview:
    """Разбирает файл и показывает, что получится. В базу ничего не пишет."""

    _require_editor(user)
    return _build_preview(db, kind, _read_upload(file), file.filename or "")


@router.post("/{kind}/apply", response_model=ImportResult)
def apply_import(
    kind: ImportKind, db: DbSession, user: CurrentUser, file: UploadFile = File(...)
) -> ImportResult:
    """Применяет файл. Строки с ошибками пропускаются, остальные загружаются."""

    _require_editor(user)

    content = _read_upload(file)
    raw = imports.read_table(content, file.filename or "")
    rows = imports.parse(db, kind, raw)

    if kind is ImportKind.STOCK:
        return _apply_stock(db, user, rows)

    stats = imports.apply(db, kind, rows)
    db.commit()

    return ImportResult(
        **stats,
        message=(
            f"Загружено: создано {stats['created']}, обновлено {stats['updated']}"
            + (f", пропущено с ошибками {stats['skipped']}" if stats["skipped"] else "")
        ),
    )


def _apply_stock(db: DbSession, user: Any, rows: list[imports.RowResult]) -> ImportResult:
    """Начальные остатки заводятся инвентаризацией — по одной на склад.

    Инвентаризация выравнивает остаток до указанного количества, поэтому
    повторная загрузка того же файла не удваивает запас.
    """

    by_warehouse: dict[Any, list[imports.RowResult]] = {}
    skipped = 0

    for row in rows:
        if not row.valid:
            skipped += 1
            continue
        warehouse = imports._by_code_or_name(db, Warehouse, row.values.get("warehouse", ""))
        by_warehouse.setdefault(warehouse.id, []).append(row)

    documents = 0
    positions = 0

    for warehouse_id, items in by_warehouse.items():
        document = StockDocument(
            document_type=StockDocumentType.INVENTORY,
            warehouse_id=warehouse_id,
            document_date=datetime.now(UTC),
            author_id=user.id,
            comment="Начальные остатки, загружены из файла",
        )
        db.add(document)
        db.flush()

        total = Decimal(0)
        for index, row in enumerate(items, start=1):
            product = imports._by_code_or_name(db, Nomenclature, row.values.get("nomenclature", ""))
            quantity = row.values["quantity"] or Decimal(0)
            price = row.values.get("price") or Decimal(0)
            amount = (Decimal(quantity) * Decimal(price)).quantize(Decimal("0.01"))
            total += amount
            document.lines.append(
                StockDocumentLine(
                    line_number=index,
                    nomenclature_id=product.id,
                    quantity=quantity,
                    price=price,
                    amount=amount,
                )
            )
            positions += 1

        document.total_amount = total
        stock.post(db, document)
        documents += 1

    db.commit()

    return ImportResult(
        created=positions,
        updated=0,
        skipped=skipped,
        message=(
            f"Заведено инвентаризаций: {documents}, позиций: {positions}"
            + (f", пропущено с ошибками {skipped}" if skipped else "")
        ),
    )
