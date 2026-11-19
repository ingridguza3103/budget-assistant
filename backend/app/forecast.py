from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import case, func, select

from .budgets import CurrentUser, Month, OwnedBudget, budget_view, month_start
from .database import Database
from .models import MAX_CENTS, BudgetEntry, MonthlyBudget, User

router = APIRouter(prefix="/api", tags=["forecast"])
SignedCents = Annotated[int, Field(strict=True, ge=-MAX_CENTS, le=MAX_CENTS)]


class ForecastSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starting_balance_cents: SignedCents
    from_month: Month | None = None


class ForecastSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    use_actuals: StrictBool


class ForecastMonth(BaseModel):
    budget_id: int
    month: Month
    planned_remainder_cents: int
    recorded_remainder_cents: int
    use_actuals: bool
    planned_balance_cents: int
    forecast_balance_cents: int
    actual_balance_cents: int | None


class ForecastView(ForecastSettings):
    months: list[ForecastMonth]
    planned_end_balance_cents: int
    forecast_end_balance_cents: int
    actual_balance_cents: int
    actual_through_month: Month | None


def forecast_view(db: Database, user: User) -> ForecastView:
    net = func.coalesce(func.sum(case(
        (BudgetEntry.category == "income", BudgetEntry.amount_cents),
        else_=-BudgetEntry.amount_cents,
    )), 0)
    query = (
        select(MonthlyBudget, net)
        .outerjoin(BudgetEntry, BudgetEntry.budget_id == MonthlyBudget.id)
        .where(MonthlyBudget.user_id == user.id)
        .group_by(MonthlyBudget.id)
        .order_by(MonthlyBudget.month)
    )
    if user.forecast_from_month:
        query = query.where(MonthlyBudget.month >= user.forecast_from_month)

    planned_balance = forecast_balance = actual_balance = user.starting_balance_cents
    actual_prefix = True
    actual_through = None
    months = []
    for budget, recorded_net in db.execute(query):
        month = budget.month.isoformat()[:7]
        planned_net = budget_view(budget).planned_remainder_cents
        recorded_net = int(recorded_net)
        planned_balance += planned_net
        forecast_balance += recorded_net if budget.use_actuals else planned_net
        actual_prefix = actual_prefix and budget.use_actuals
        if actual_prefix:
            actual_balance += recorded_net
            actual_through = month
        months.append(ForecastMonth(
            budget_id=budget.id, month=month, planned_remainder_cents=planned_net,
            recorded_remainder_cents=recorded_net, use_actuals=budget.use_actuals,
            planned_balance_cents=planned_balance, forecast_balance_cents=forecast_balance,
            actual_balance_cents=actual_balance if actual_prefix else None,
        ))
    return ForecastView(
        starting_balance_cents=user.starting_balance_cents,
        from_month=user.forecast_from_month.isoformat()[:7] if user.forecast_from_month else None,
        months=months, planned_end_balance_cents=planned_balance, forecast_end_balance_cents=forecast_balance,
        actual_balance_cents=actual_balance, actual_through_month=actual_through,
    )


@router.get("/forecast")
def read_forecast(db: Database, user: CurrentUser) -> ForecastView:
    return forecast_view(db, user)


@router.put("/forecast")
def save_settings(payload: ForecastSettings, db: Database, user: CurrentUser) -> ForecastView:
    user.starting_balance_cents = payload.starting_balance_cents
    user.forecast_from_month = month_start(payload.from_month) if payload.from_month else None
    db.commit()
    return forecast_view(db, user)


@router.put("/budgets/{budget_id}/forecast")
def set_month_source(payload: ForecastSource, budget: OwnedBudget, db: Database, user: CurrentUser) -> ForecastView:
    budget.use_actuals = payload.use_actuals
    db.commit()
    return forecast_view(db, user)
