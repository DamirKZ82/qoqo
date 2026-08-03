"""Ролевая модель: директор и бухгалтер вместо менеджера

Revision ID: a1c4e7d20b31
Revises: 67cca50b0fb8
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1c4e7d20b31"
down_revision: str | Sequence[str] | None = "67cca50b0fb8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Роль хранится строкой (Enum с native_enum=False и без CHECK-ограничения),
# поэтому достаточно перенести значения — схема не меняется.


def upgrade() -> None:
    # Менеджер по смыслу ближе всего к директору: полный доступ к заявкам.
    op.execute(sa.text("UPDATE users SET role = 'director' WHERE role = 'manager'"))


def downgrade() -> None:
    op.execute(
        sa.text("UPDATE users SET role = 'manager' WHERE role IN ('director', 'accountant')")
    )
