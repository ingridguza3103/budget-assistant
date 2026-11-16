"""Create one monthly plan per account and month."""

from alembic import op
import sqlalchemy as sa

revision = "0002_budgets"
down_revision = "0001_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("planned_income_cents", sa.Integer(), nullable=False),
        sa.Column("bills_cents", sa.Integer(), nullable=False),
        sa.Column("everyday_cents", sa.Integer(), nullable=False),
        sa.Column("savings_cents", sa.Integer(), nullable=False),
        sa.Column("debt_cents", sa.Integer(), nullable=False),
        sa.UniqueConstraint("user_id", "month", name="uq_budgets_user_month"),
        sa.CheckConstraint("EXTRACT(DAY FROM month) = 1", name="ck_budgets_month_start"),
        sa.CheckConstraint(
            "planned_income_cents BETWEEN 0 AND 99999999 "
            "AND bills_cents BETWEEN 0 AND 99999999 "
            "AND everyday_cents BETWEEN 0 AND 99999999 "
            "AND savings_cents BETWEEN 0 AND 99999999 "
            "AND debt_cents BETWEEN 0 AND 99999999",
            name="ck_budgets_amounts",
        ),
    )


def downgrade() -> None:
    op.drop_table("budgets")
