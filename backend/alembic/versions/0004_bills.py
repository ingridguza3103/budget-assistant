"""Add a bill schedule to each budget."""

from alembic import op
import sqlalchemy as sa

revision = "0004_bills"
down_revision = "0003_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheduled_bills",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("budget_id", sa.Integer(), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("paid", sa.Boolean(), nullable=False),
        sa.CheckConstraint("amount_cents BETWEEN 1 AND 99999999", name="ck_bills_amount"),
    )
    op.create_index("ix_scheduled_bills_budget_id", "scheduled_bills", ["budget_id"])


def downgrade() -> None:
    op.drop_table("scheduled_bills")
