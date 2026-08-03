"""Уведомления сотрудникам о событиях в системе.

Пока событие одно — заявка ушла на склад. Сюда же добавляются будущие рассылки:
задачи на исполнение, напоминания и прочее. Отправка отделена от обработчиков
API намеренно: сбой мессенджера не должен влиять на исход операции.
"""

import logging

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import STATUS_TITLES, Order, User, UserRole
from app.services import telegram

logger = logging.getLogger(__name__)


def _warehouse_recipients(db: Session, order: Order) -> list[User]:
    """Кладовщики, которым адресована заявка.

    Правило то же, что и в списке заявок: сотрудник склада видит свой склад и
    заявки без указанного склада, — иначе уведомление ушло бы не туда.
    """

    stmt = (
        select(User)
        .where(User.role == UserRole.WAREHOUSE)
        .where(User.is_active.is_(True))
        .where(User.telegram_chat_id.is_not(None))
    )

    if order.warehouse_id is not None:
        stmt = stmt.where(or_(User.warehouse_id == order.warehouse_id, User.warehouse_id.is_(None)))

    return list(db.execute(stmt).unique().scalars().all())


def order_submitted(db: Session, order: Order) -> None:
    """Заявка отправлена на склад."""

    if not telegram.is_configured():
        return

    outlet = order.outlet.name if order.outlet else "точка не указана"
    text = (
        f"🧾 <b>Новая заявка {telegram.html(order.display_number)}</b>\n"
        f"{telegram.html(order.counterparty.name if order.counterparty else '')}\n"
        f"Точка: {telegram.html(outlet)}\n"
        f"Позиций: {len(order.lines)} · Сумма: {telegram.html(order.total_amount)} ₸\n"
        f"Оформил: {telegram.html(order.author.full_name if order.author else '')}"
    )

    try:
        delivered = telegram.notify_users(_warehouse_recipients(db, order), text)
        logger.info("Заявка %s: уведомлено складов — %s", order.display_number, delivered)
    except Exception:
        # Заявка уже сохранена; провал уведомления не должен её откатывать.
        logger.exception("Не удалось разослать уведомление по заявке %s", order.id)


def order_status_changed(db: Session, order: Order) -> None:
    """Статус заявки изменился — сообщаем её автору."""

    if not telegram.is_configured() or order.author is None:
        return

    status_title = STATUS_TITLES.get(order.status, order.status.value)
    text = (
        f"📦 Заявка <b>{telegram.html(order.display_number)}</b>: "
        f"{telegram.html(status_title.lower())}\n"
        f"{telegram.html(order.counterparty.name if order.counterparty else '')}"
    )

    try:
        telegram.notify_user(order.author, text)
    except Exception:
        logger.exception("Не удалось уведомить автора заявки %s", order.id)
