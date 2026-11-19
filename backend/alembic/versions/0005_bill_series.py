"""Store monthly bill rules separately from their individual occurrences."""

from alembic import op
import sqlalchemy as sa

revision = "0005_bill_series"
down_revision = "0004_bills"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bill_series",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_month", sa.Date(), nullable=False),
        sa.Column("end_month", sa.Date(), nullable=True),
        sa.Column("due_day", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.CheckConstraint("due_day BETWEEN 1 AND 31", name="ck_series_day"),
        sa.CheckConstraint("amount_cents BETWEEN 1 AND 99999999", name="ck_series_amount"),
        sa.CheckConstraint("end_month IS NULL OR end_month >= start_month", name="ck_series_range"),
    )
    op.create_index("ix_bill_series_user_id", "bill_series", ["user_id"])
    op.add_column("scheduled_bills", sa.Column("series_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_scheduled_series", "scheduled_bills", "bill_series", ["series_id"], ["id"], ondelete="SET NULL")
    op.create_unique_constraint("uq_series_budget", "scheduled_bills", ["series_id", "budget_id"])


def downgrade() -> None:
    op.drop_constraint("uq_series_budget", "scheduled_bills", type_="unique")
    op.drop_constraint("fk_scheduled_series", "scheduled_bills", type_="foreignkey")
    op.drop_column("scheduled_bills", "series_id")
    op.drop_table("bill_series")
