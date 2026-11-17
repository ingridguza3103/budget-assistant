"""Add dated income and outflow entries for a budget."""

from alembic import op
import sqlalchemy as sa

revision = "0003_activity"
down_revision = "0002_budgets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("budget_id", sa.Integer(), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("description", sa.String(140), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.CheckConstraint("category IN ('income', 'bills', 'everyday', 'savings', 'debt')", name="ck_entries_category"),
        sa.CheckConstraint("amount_cents BETWEEN 1 AND 99999999", name="ck_entries_amount"),
    )
    op.create_index("ix_budget_entries_budget_id", "budget_entries", ["budget_id"])


def downgrade() -> None:
    op.drop_table("budget_entries")
