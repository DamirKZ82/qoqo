"""translations for content blocks and news

Revision ID: f22a91ea9807
Revises: a1c4e7d20b31
Create Date: 2026-08-03 21:26:43.272875

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f22a91ea9807"
down_revision: str | Sequence[str] | None = "a1c4e7d20b31"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default нужен, чтобы колонка добавилась к уже существующим строкам:
    # у них переводов ещё нет, и это пустой словарь.
    for table in ("content_blocks", "news_posts"):
        op.add_column(
            table,
            sa.Column(
                "translations",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("news_posts", "translations")
    op.drop_column("content_blocks", "translations")
