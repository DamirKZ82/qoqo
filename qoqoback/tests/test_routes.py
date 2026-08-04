from datetime import date

import pytest

from app.models.route import VISITED_RESULTS, VisitResult
from app.services import routes


class FakeVisit:
    def __init__(self, result: VisitResult, distance: int | None = None) -> None:
        self.result = result
        self.distance_m = distance


class FakeItem:
    def __init__(self, visit: FakeVisit | None = None) -> None:
        self.visit = visit


# Астана: Байтерек и точка примерно в 300 метрах от него.
BAITEREK = (51.128422, 71.430564)


def test_distance_between_same_point_is_zero() -> None:
    assert routes.distance_meters(*BAITEREK, *BAITEREK) == 0


def test_distance_is_symmetric_and_reasonable() -> None:
    """Расстояние до соседней улицы — сотни метров, а не километры."""

    nearby = (51.131, 71.430564)
    forward = routes.distance_meters(*BAITEREK, *nearby)
    backward = routes.distance_meters(*nearby, *BAITEREK)

    assert forward == backward
    assert 250 < forward < 350


def test_distance_between_cities() -> None:
    # Астана — Алматы, порядка 970 км по прямой.
    almaty = (43.238949, 76.889709)
    distance = routes.distance_meters(*BAITEREK, *almaty)
    assert 900_000 < distance < 1_050_000


@pytest.mark.parametrize(
    "coords",
    [
        (None, 71.4, 51.1, 71.4),
        (51.1, None, 51.1, 71.4),
        (51.1, 71.4, None, 71.4),
        (51.1, 71.4, 51.1, None),
    ],
)
def test_distance_is_unknown_without_coordinates(coords: tuple) -> None:
    """У точки может быть не заполнена карта — это не ошибка."""

    assert routes.distance_meters(*coords) is None


def test_nearby_is_unknown_without_distance() -> None:
    # Ни подтвердить, ни опровергнуть: показывать надо честно.
    assert routes.is_nearby(None) is None


def test_nearby_uses_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSettings:
        visit_max_distance_m = 300

    monkeypatch.setattr(routes, "get_settings", lambda: FakeSettings())

    assert routes.is_nearby(0) is True
    assert routes.is_nearby(300) is True
    assert routes.is_nearby(301) is False


def test_visited_results_exclude_planned_and_skipped() -> None:
    assert VisitResult.PLANNED not in VISITED_RESULTS
    assert VisitResult.SKIPPED not in VISITED_RESULTS
    assert VisitResult.CLOSED in VISITED_RESULTS


def test_summary_counts_plan_against_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSettings:
        visit_max_distance_m = 300

    monkeypatch.setattr(routes, "get_settings", lambda: FakeSettings())

    items = [
        FakeItem(),  # ещё не был
        FakeItem(FakeVisit(VisitResult.ORDER, 50)),
        FakeItem(FakeVisit(VisitResult.NO_ORDER, 4000)),  # отметился издалека
        FakeItem(FakeVisit(VisitResult.SKIPPED)),
        FakeItem(FakeVisit(VisitResult.PLANNED, 10)),  # пришёл, но не завершил
    ]

    summary = routes.summarize(items)
    assert summary["planned"] == 5
    assert summary["visited"] == 2
    assert summary["skipped"] == 1
    assert summary["left"] == 2
    assert summary["far_away"] == 1


def test_weekday_matches_iso_numbering() -> None:
    """Понедельник — 1, воскресенье — 7: на этом держится отбор точек по дням."""

    assert date(2026, 8, 3).isoweekday() == 1
    assert date(2026, 8, 9).isoweekday() == 7
