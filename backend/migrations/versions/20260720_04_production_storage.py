"""Store application users and sync snapshots in PostgreSQL.

Revision ID: 20260720_04
Revises: 20260717_03
Create Date: 2026-07-20
"""

from alembic import op

from app.core.database import Base
import app.models.question  # noqa: F401


revision = "20260720_04"
down_revision = "20260717_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    for table_name in ("app_users", "sync_snapshots"):
        Base.metadata.tables[table_name].create(bind=bind, checkfirst=True)


def downgrade() -> None:
    # Keep account and sync data during a downgrade.
    pass
