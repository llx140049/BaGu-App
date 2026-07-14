"""Create the initial application schema, including review_events.

Revision ID: 20260713_01
Revises:
Create Date: 2026-07-13
"""

from alembic import op

from app.core.database import Base
import app.models.question  # noqa: F401 - register all model metadata


revision = "20260713_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is the baseline migration for the existing ORM schema. In
    # particular it creates the immutable `review_events` history table.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    # Reverse only the tables owned by this initial application schema.
    bind = op.get_bind()
    for table_name in (
        "review_events",
        "study_records",
        "card_progress",
        "upload_records",
        "question_sources",
        "questions",
        "documents",
    ):
        table = Base.metadata.tables.get(table_name)
        if table is not None:
            table.drop(bind=bind, checkfirst=True)
