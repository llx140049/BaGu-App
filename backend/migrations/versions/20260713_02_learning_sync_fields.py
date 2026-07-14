"""Add document reading data and daily learning settings.

Revision ID: 20260713_02
Revises: 20260713_01
Create Date: 2026-07-13
"""

from alembic import op
import sqlalchemy as sa


revision = "20260713_02"
down_revision = "20260713_01"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    document_columns = _columns("documents")
    for name, column in (
        ("cat", sa.Column("cat", sa.String(length=100), nullable=False, server_default="")),
        ("tags", sa.Column("tags", sa.JSON(), nullable=True)),
        ("scroll_offset", sa.Column("scroll_offset", sa.Float(), nullable=False, server_default="0")),
        ("reading_progress", sa.Column("reading_progress", sa.Float(), nullable=False, server_default="0")),
        ("last_read_at", sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True)),
    ):
        if name not in document_columns:
            op.add_column("documents", column)

    question_columns = _columns("questions")
    if "primary_source_document_id" in question_columns and "source_document_id" not in question_columns:
        with op.batch_alter_table("questions") as batch:
            batch.alter_column("primary_source_document_id", new_column_name="source_document_id")
    elif "source_document_id" not in question_columns:
        op.add_column("questions", sa.Column("source_document_id", sa.UUID(), nullable=True))
        op.create_index("ix_questions_source_document_id", "questions", ["source_document_id"])

    study_columns = _columns("study_records")
    if "new_count" not in study_columns:
        op.add_column("study_records", sa.Column("new_count", sa.Integer(), nullable=False, server_default="0"))

    sa.Table(
        "user_settings",
        sa.MetaData(),
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("daily_new_target", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", name="uq_user_settings_user_id"),
    ).create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    op.drop_table("user_settings")
    # Keep data-bearing columns in place on downgrade; deleting them would
    # discard locally synced reading and daily-goal information.
