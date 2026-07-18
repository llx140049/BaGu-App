"""Store the uploaded original file key on documents.

Revision ID: 20260717_03
Revises: 20260713_02
Create Date: 2026-07-17
"""

from alembic import op
import sqlalchemy as sa


revision = "20260717_03"
down_revision = "20260713_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("documents")}
    if "original_file_key" not in columns:
        op.add_column("documents", sa.Column("original_file_key", sa.String(length=255), nullable=False, server_default=""))


def downgrade() -> None:
    # Keep the key on downgrade to avoid losing the original-file association.
    pass
