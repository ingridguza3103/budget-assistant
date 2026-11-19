"""Store forecast settings, actual-month choices and Other allocations."""

from alembic import op
import sqlalchemy as sa

revision = "0006_forecast_and_other"
down_revision = "0005_bill_series"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("starting_balance_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("forecast_from_month", sa.Date(), nullable=True))
    op.create_check_constraint("ck_users_starting_balance", "users",
                               "starting_balance_cents BETWEEN -99999999 AND 99999999")
    op.create_check_constraint("ck_users_forecast_month", "users",
                               "forecast_from_month IS NULL OR EXTRACT(DAY FROM forecast_from_month) = 1")
    op.add_column("budgets", sa.Column("other_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("budgets", sa.Column("use_actuals", sa.Boolean(), nullable=False, server_default="false"))
    op.create_check_constraint("ck_budgets_other", "budgets", "other_cents BETWEEN 0 AND 99999999")
    op.drop_constraint("ck_entries_category", "budget_entries", type_="check")
    op.create_check_constraint("ck_entries_category", "budget_entries",
                               "category IN ('income', 'bills', 'everyday', 'savings', 'debt', 'other')")


def downgrade() -> None:
    op.drop_constraint("ck_entries_category", "budget_entries", type_="check")
    op.create_check_constraint("ck_entries_category", "budget_entries",
                               "category IN ('income', 'bills', 'everyday', 'savings', 'debt')")
    op.drop_constraint("ck_budgets_other", "budgets", type_="check")
    op.drop_column("budgets", "use_actuals")
    op.drop_column("budgets", "other_cents")
    op.drop_constraint("ck_users_forecast_month", "users", type_="check")
    op.drop_constraint("ck_users_starting_balance", "users", type_="check")
    op.drop_column("users", "forecast_from_month")
    op.drop_column("users", "starting_balance_cents")
