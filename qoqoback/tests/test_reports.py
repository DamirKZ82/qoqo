import uuid
from datetime import date

import httpx
import pytest
from fastapi import HTTPException

from app.api.routes.reports import (
    ReportQuery,
    _bucket_start,
    _bucket_starts,
    report_query,
)
from app.main import app
from app.schemas.report import (
    CSV_HEADERS,
    CSV_TOTAL,
    Dimension,
    ExportLanguage,
    PeriodGroup,
    dimension_title,
)


def make_query(date_from: date, date_to: date) -> ReportQuery:
    return ReportQuery(
        date_from=date_from,
        date_to=date_to,
        warehouse_id=None,
        outlet_id=None,
        counterparty_id=None,
        author_id=None,
    )


def test_previous_period_is_same_length_and_ends_before_current() -> None:
    query = make_query(date(2026, 7, 5), date(2026, 8, 3))
    previous = query.previous

    assert query.days == 30
    assert previous.days == 30
    assert previous.date_to == date(2026, 7, 4)
    assert previous.date_from == date(2026, 6, 5)


def test_previous_period_keeps_filters() -> None:
    """Прошлый период сравниваем в том же срезе, иначе цифры несопоставимы."""

    warehouse = uuid.uuid4()
    counterparty = uuid.uuid4()
    query = make_query(date(2026, 8, 1), date(2026, 8, 3))
    query.warehouse_id = warehouse
    query.counterparty_id = counterparty

    previous = query.previous
    assert previous.warehouse_id == warehouse
    assert previous.counterparty_id == counterparty


@pytest.mark.parametrize(
    ("group", "value", "expected"),
    [
        (PeriodGroup.DAY, date(2026, 8, 3), date(2026, 8, 3)),
        # 3 августа 2026 — понедельник, 5-е — среда: обе даты в одной неделе.
        (PeriodGroup.WEEK, date(2026, 8, 5), date(2026, 8, 3)),
        (PeriodGroup.MONTH, date(2026, 8, 5), date(2026, 8, 1)),
    ],
)
def test_bucket_start(group: PeriodGroup, value: date, expected: date) -> None:
    assert _bucket_start(group, value) == expected


def test_days_without_orders_stay_in_series() -> None:
    """Пустые периоды нужны: иначе провал в продажах читается как обрыв данных."""

    starts = _bucket_starts(PeriodGroup.DAY, make_query(date(2026, 8, 1), date(2026, 8, 5)))
    assert starts == [date(2026, 8, day) for day in range(1, 6)]


def test_month_buckets_cross_year_boundary() -> None:
    starts = _bucket_starts(PeriodGroup.MONTH, make_query(date(2025, 11, 17), date(2026, 2, 3)))
    assert starts == [
        date(2025, 11, 1),
        date(2025, 12, 1),
        date(2026, 1, 1),
        date(2026, 2, 1),
    ]


def test_report_query_rejects_reversed_period() -> None:
    with pytest.raises(HTTPException) as excinfo:
        report_query(date_from=date(2026, 8, 3), date_to=date(2026, 7, 1))
    assert "позже" in excinfo.value.detail


def test_report_query_rejects_too_long_period() -> None:
    with pytest.raises(HTTPException) as excinfo:
        report_query(date_from=date(2020, 1, 1), date_to=date(2026, 1, 1))
    assert "длиннее" in excinfo.value.detail


def test_csv_headers_cover_every_language() -> None:
    """Выгрузку пишет сервер, поэтому заголовки нужны на обоих языках."""

    for language in ExportLanguage:
        assert language in CSV_HEADERS
        assert language in CSV_TOTAL
        for dimension in Dimension:
            assert dimension_title(dimension, language)


async def test_reports_require_authorization() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for path in ("/api/v1/reports/sales", "/api/v1/reports/breakdown"):
            response = await client.get(path)
            assert response.status_code == 401
