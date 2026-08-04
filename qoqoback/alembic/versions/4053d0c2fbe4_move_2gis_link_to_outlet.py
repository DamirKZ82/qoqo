"""move 2gis link to outlet

Revision ID: 4053d0c2fbe4
Revises: aeac3a55fbde
Create Date: 2026-08-04 10:10:51.796589

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4053d0c2fbe4"
down_revision: str | Sequence[str] | None = "aeac3a55fbde"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Профиль в 2ГИС привязан к адресу, а у сети адресов много: ссылка переезжает
# с контрагента на торговую точку.
#
# Значение переносим только там, где у контрагента ровно одна точка: тогда
# ясно, к какому адресу относилась ссылка. У сети с несколькими точками
# одинаковая ссылка на всех адресах была бы просто неверными данными.
MOVE_TO_SINGLE_OUTLET = sa.text("""
    UPDATE outlets AS o
       SET dgis_url = c.dgis_url
      FROM counterparties AS c
     WHERE o.counterparty_id = c.id
       AND c.dgis_url IS NOT NULL
       AND (SELECT count(*) FROM outlets WHERE counterparty_id = c.id) = 1
""")

MOVE_BACK = sa.text("""
    UPDATE counterparties AS c
       SET dgis_url = o.dgis_url
      FROM outlets AS o
     WHERE o.counterparty_id = c.id
       AND o.dgis_url IS NOT NULL
       AND (SELECT count(*) FROM outlets WHERE counterparty_id = c.id) = 1
""")


def upgrade() -> None:
    """Upgrade schema."""

    # Сначала добавляем и переносим, только потом удаляем: иначе заполненные
    # ссылки пропали бы вместе со старой колонкой.
    op.add_column("outlets", sa.Column("dgis_url", sa.String(length=1000), nullable=True))
    op.execute(MOVE_TO_SINGLE_OUTLET)
    op.drop_column("counterparties", "dgis_url")


def downgrade() -> None:
    """Downgrade schema."""

    op.add_column(
        "counterparties",
        sa.Column("dgis_url", sa.VARCHAR(length=1000), autoincrement=False, nullable=True),
    )
    op.execute(MOVE_BACK)
    op.drop_column("outlets", "dgis_url")
