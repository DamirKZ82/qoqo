import uuid

from app.schemas.order import OrderWrite


def test_order_accepts_client_generated_id() -> None:
    """Идентификатор задаёт клиент — это ключ идемпотентности.

    Без него повторная отправка после обрыва связи создавала бы дубль заявки.
    """

    given = uuid.uuid4()
    payload = OrderWrite(id=given, counterparty_id=uuid.uuid4(), lines=[])
    assert payload.id == given


def test_order_id_is_optional() -> None:
    """Онлайн-клиент идентификатор не присылает — его выдаёт сервер."""

    payload = OrderWrite(counterparty_id=uuid.uuid4(), lines=[])
    assert payload.id is None
