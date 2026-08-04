"""Ищет миграции, которые ломают уже работающий код.

Схема и код меняются не одновременно. Даже при строгом порядке выкатки есть
промежуток, когда старые процессы ещё живы, а схема уже новая, — а на Vercel
сборка и накат идут вообще параллельно. Поэтому миграция обязана оставлять
предыдущую версию кода работоспособной.

Практическое правило: сначала добавляем, потом переносим, и только следующей
выкаткой удаляем. Удаление колонки в том же шаге, где код перестал ей
пользоваться, даёт пятиминутное окно, в котором работающие процессы падают на
каждом запросе.

Что считается опасным:

* удаление колонки, таблицы или ограничения — старый код на них рассчитывает;
* добавление обязательной колонки без значения по умолчанию — вставка из
  старого кода не заполнит её и упадёт;
* ужесточение колонки до NOT NULL без значения по умолчанию — то же самое.

Если шаг действительно нужен и совместимость продумана, это объявляется прямо
в файле миграции:

    BREAKS_OLD_CODE = "колонка удаляется через выкатку после переноса данных"

Строка попадёт в вывод проверки — по ней потом видно, чем руководствовались.

Запуск:  python -m tools.check_migrations <файлы миграций>
"""

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

# Операции, после которых предыдущая версия кода перестаёт работать.
DESTRUCTIVE = {
    "drop_column": "удаляет колонку",
    "drop_table": "удаляет таблицу",
    "drop_constraint": "снимает ограничение",
    "drop_index": "удаляет индекс",
}

MARKER = "BREAKS_OLD_CODE"


@dataclass(slots=True)
class Finding:
    file: str
    line: int
    what: str


def _keyword(call: ast.Call, name: str) -> ast.expr | None:
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    return None


def _is_false(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def _column_requires_value(call: ast.Call) -> bool:
    """Обязательная колонка без значения по умолчанию.

    `sa.Column(..., nullable=False)` без `server_default` не даст старому коду
    вставить строку: он про эту колонку ничего не знает.
    """

    if not isinstance(call.func, ast.Attribute) or call.func.attr != "Column":
        return False
    return _is_false(_keyword(call, "nullable")) and _keyword(call, "server_default") is None


def _describe(call: ast.Call) -> str | None:
    """Что опасного делает вызов, или None, если ничего."""

    if not isinstance(call.func, ast.Attribute):
        return None

    name = call.func.attr

    if name in DESTRUCTIVE:
        return DESTRUCTIVE[name]

    if name == "add_column":
        for arg in call.args:
            if isinstance(arg, ast.Call) and _column_requires_value(arg):
                return "добавляет обязательную колонку без значения по умолчанию"

    if (
        name == "alter_column"
        and _is_false(_keyword(call, "nullable"))
        and _keyword(call, "server_default") is None
    ):
        return "делает колонку обязательной без значения по умолчанию"

    return None


def _upgrade_body(tree: ast.Module) -> list[ast.stmt]:
    """Тело upgrade(). downgrade() не проверяем: откат и должен удалять."""

    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "upgrade":
            return node.body
    return []


def _declared_reason(tree: ast.Module) -> str | None:
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == MARKER:
                    if isinstance(node.value, ast.Constant):
                        return str(node.value.value)
                    return "без пояснения"
    return None


def check(path: Path) -> tuple[list[Finding], str | None]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    reason = _declared_reason(tree)

    findings: list[Finding] = []
    for statement in _upgrade_body(tree):
        for node in ast.walk(statement):
            if isinstance(node, ast.Call) and (what := _describe(node)):
                findings.append(Finding(file=str(path), line=node.lineno, what=what))

    return findings, reason


def main(argv: list[str]) -> int:
    paths = [Path(item) for item in argv if item.endswith(".py")]
    if not paths:
        print("Миграций в изменениях нет — проверять нечего")
        return 0

    problems = 0
    for path in paths:
        if not path.exists():
            # Файл могли удалить в том же изменении.
            continue

        findings, reason = check(path)
        if not findings:
            continue

        if reason:
            print(f"{path}: опасные операции объявлены — {reason}")
            for item in findings:
                print(f"    строка {item.line}: {item.what}")
            continue

        problems += len(findings)
        for item in findings:
            # Формат аннотации GitHub: замечание видно прямо в файле.
            print(f"::error file={item.file},line={item.line}::Миграция {item.what}")
            print(f"{path}:{item.line}: {item.what}")

    if problems:
        print()
        print(
            f"Найдено опасных операций: {problems}. Такая миграция ломает уже работающий код: "
            "во время выкатки старые процессы живы, а схема уже новая.\n"
            "Разнесите изменение на две выкатки — сначала добавить и перенести, "
            f'потом удалить, — либо объявьте в файле миграции {MARKER} = "причина".'
        )
        return 1

    print(f"Проверено миграций: {len(paths)}. Опасных операций нет")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
