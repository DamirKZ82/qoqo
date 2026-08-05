"""Классификаторы: наборы, которые не заводит пользователь."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import CurrentUser
from app.data import okei

router = APIRouter(prefix="/classifiers", tags=["Классификаторы"])


class OkeiUnitRead(BaseModel):
    code: str
    symbol: str
    name: str
    group: str


@router.get("/okei", response_model=list[OkeiUnitRead])
def list_okei(_: CurrentUser, search: str | None = None) -> list[OkeiUnitRead]:
    """Единицы измерения из ОКЕИ для подбора при заведении единицы.

    Данные неизменны, поэтому лежат в коде, а не в базе: заводить таблицу и
    миграцию ради списка, который правится вместе с кодом, незачем.
    """

    return [
        OkeiUnitRead(code=u.code, symbol=u.symbol, name=u.name, group=u.group)
        for u in okei.search(search)
    ]
