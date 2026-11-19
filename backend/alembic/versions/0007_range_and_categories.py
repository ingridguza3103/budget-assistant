"""Add an inclusive forecast end month and specific expense categories."""

from alembic import op
import sqlalchemy as sa

revision = "0007_range_and_categories"
down_revision = "0006_forecast_and_other"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("forecast_until_month", sa.Date(), nullable=True))
    op.create_check_constraint("ck_users_forecast_until_month", "users",
                               "forecast_until_month IS NULL OR EXTRACT(DAY FROM forecast_until_month) = 1")
    op.create_check_constraint("ck_users_forecast_range", "users",
                               "forecast_from_month IS NULL OR forecast_until_month IS NULL OR forecast_from_month <= forecast_until_month")
    for category in ("travel", "gifts", "groceries"):
        op.add_column("budgets", sa.Column(f"{category}_cents", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_budgets_specific_categories", "budgets",
                               "travel_cents BETWEEN 0 AND 99999999 AND gifts_cents BETWEEN 0 AND 99999999 AND groceries_cents BETWEEN 0 AND 99999999")
    op.drop_constraint("ck_entries_category", "budget_entries", type_="check")
    op.create_check_constraint("ck_entries_category", "budget_entries",
                               "category IN ('income', 'bills', 'everyday', 'savings', 'debt', 'travel', 'gifts', 'groceries', 'other')")


def downgrade() -> None:
    op.drop_constraint("ck_entries_category", "budget_entries", type_="check")
    op.create_check_constraint("ck_entries_category", "budget_entries",
                               "category IN ('income', 'bills', 'everyday', 'savings', 'debt', 'other')")
    op.drop_constraint("ck_budgets_specific_categories", "budgets", type_="check")
    for category in ("groceries", "gifts", "travel"):
        op.drop_column("budgets", f"{category}_cents")
    op.drop_constraint("ck_users_forecast_range", "users", type_="check")
    op.drop_constraint("ck_users_forecast_until_month", "users", type_="check")
    op.drop_column("users", "forecast_until_month")
