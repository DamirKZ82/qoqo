from datetime import UTC, datetime, timedelta

import pytest

from app.services import telegram
from app.services.telegram_updates import handle_update


class FakeUser:
    def __init__(self) -> None:
        self.full_name = "Кладовщик"
        self.email = "sklad@qoqo.kz"
        self.role = type("R", (), {"value": "warehouse"})()
        self.telegram_chat_id: int | None = None
        self.telegram_username: str | None = None
        self.telegram_linked_at: datetime | None = None


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[tuple[int, str]]:
    """Перехватывает отправку, чтобы тесты не ходили в Telegram."""

    messages: list[tuple[int, str]] = []
    monkeypatch.setattr(
        telegram, "send_message", lambda chat_id, text: messages.append((chat_id, text)) or True
    )
    return messages


def test_non_command_message_is_ignored(sent: list, monkeypatch: pytest.MonkeyPatch) -> None:
    # Обычную переписку бот не трогает: он реагирует только на команды.
    handle_update(None, {"message": {"chat": {"id": 1}, "text": "привет"}})
    assert sent == []


def test_update_without_message_is_ignored(sent: list) -> None:
    handle_update(None, {"callback_query": {"id": "1"}})
    assert sent == []


def test_start_without_code_explains(sent: list) -> None:
    handle_update(None, {"message": {"chat": {"id": 7}, "text": "/start"}})
    assert len(sent) == 1
    assert "панели пользователя" in sent[0][1]


def test_start_with_bad_code_reports(sent: list, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(telegram, "redeem_link_code", lambda *args, **kwargs: None)
    handle_update(None, {"message": {"chat": {"id": 7}, "text": "/start abc"}})
    assert "недействительна" in sent[0][1]


def test_start_with_valid_code_links(sent: list, monkeypatch: pytest.MonkeyPatch) -> None:
    user = FakeUser()
    captured: dict = {}

    def redeem(db, code, chat_id, username):
        captured.update(code=code, chat_id=chat_id, username=username)
        return user

    monkeypatch.setattr(telegram, "redeem_link_code", redeem)
    handle_update(
        None,
        {"message": {"chat": {"id": 42}, "from": {"username": "damir"}, "text": "/start code42"}},
    )

    assert captured == {"code": "code42", "chat_id": 42, "username": "damir"}
    assert "Кладовщик" in sent[0][1]


def test_command_with_bot_suffix_is_recognised(sent: list, monkeypatch: pytest.MonkeyPatch) -> None:
    # В группах Telegram дописывает имя бота: /start@q0q0_bot
    monkeypatch.setattr(telegram, "redeem_link_code", lambda *args, **kwargs: None)
    handle_update(None, {"message": {"chat": {"id": 7}, "text": "/start@q0q0_bot abc"}})
    assert "недействительна" in sent[0][1]


def test_unknown_command_shows_help(sent: list) -> None:
    handle_update(None, {"message": {"chat": {"id": 7}, "text": "/что-то"}})
    assert "/status" in sent[0][1]


def test_html_escapes_markup() -> None:
    # Имя с угловыми скобками не должно ломать разметку сообщения.
    assert telegram.html("ТОО <Рога & Копыта>") == "ТОО &lt;Рога &amp; Копыта&gt;"


def test_notify_user_skips_unlinked(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list = []
    monkeypatch.setattr(telegram, "send_message", lambda *args: calls.append(args) or True)

    assert telegram.notify_user(None, "текст") is False
    assert telegram.notify_user(FakeUser(), "текст") is False
    assert calls == []


def test_notify_user_sends_to_linked(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list = []
    monkeypatch.setattr(telegram, "send_message", lambda *args: calls.append(args) or True)

    user = FakeUser()
    user.telegram_chat_id = 555

    assert telegram.notify_user(user, "текст") is True
    assert calls == [(555, "текст")]


def test_expired_code_is_rejected() -> None:
    """Просроченный код не должен приводить к привязке."""

    class FakeCode:
        used_at = None
        expires_at = datetime.now(UTC) - timedelta(minutes=1)
        user = FakeUser()

    class FakeResult:
        def unique(self):
            return self

        def scalar_one_or_none(self):
            return FakeCode()

    class FakeSession:
        def execute(self, *args, **kwargs):
            return FakeResult()

    assert telegram.redeem_link_code(FakeSession(), "code", 1, None) is None
