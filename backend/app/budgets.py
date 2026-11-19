from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, computed_field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import Database
from .recurrence import lock_owner, schedule_for_budget
from .models import MAX_CENTS, MonthlyBudget, User

router = APIRouter(prefix="/api/budgets", tags=["budgets"])
CurrentUser = Annotated[User, Depends(get_current_user)]
Category = Literal["bills", "everyday", "savings", "debt", "travel", "gifts", "groceries", "other"]
CATEGORIES: tuple[Category, ...] = ("bills", "everyday", "savings", "debt", "travel", "gifts", "groceries", "other")
Month = Annotated[str, Field(pattern=r"^(19[0-9]{2}|[2-9][0-9]{3})-(0[1-9]|1[0-2])$")]
Cents = Annotated[int, Field(strict=True, ge=0, le=MAX_CENTS)]


class Allocations(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bills: Cents
    everyday: Cents
    savings: Cents
    debt: Cents
    other: Cents = 0
    travel: Cents = 0
    gifts: Cents = 0
    groceries: Cents = 0


class Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    planned_income_cents: Cents
    allocations: Allocations

    def column_values(self) -> dict[str, int]:
        return {
            "planned_income_cents": self.planned_income_cents,
            **{f"{category}_cents": cents for category, cents in self.allocations.model_dump().items()},
        }


class CreateBudget(Plan):
    month: Month
    copy_previous: bool = False


class BudgetView(Plan):
    id: int
    month: Month

    @computed_field
    @property
    def planned_remainder_cents(self) -> int:
        return self.planned_income_cents - sum(self.allocations.model_dump().values())


def month_start(month: str) -> date:
    return date.fromisoformat(f"{month}-01")


def budget_view(budget: MonthlyBudget) -> BudgetView:
    return BudgetView(
        id=budget.id,
        month=budget.month.isoformat()[:7],
        planned_income_cents=budget.planned_income_cents,
        allocations=Allocations(
            bills=budget.bills_cents,
            everyday=budget.everyday_cents,
            savings=budget.savings_cents,
            debt=budget.debt_cents,
            other=budget.other_cents,
            travel=budget.travel_cents,
            gifts=budget.gifts_cents,
            groceries=budget.groceries_cents,
        ),
    )


def owned_budget(budget_id: int, db: Database, user: CurrentUser) -> MonthlyBudget:
    budget = db.scalar(
        select(MonthlyBudget).where(MonthlyBudget.id == budget_id, MonthlyBudget.user_id == user.id)
    )
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found.")
    return budget


OwnedBudget = Annotated[MonthlyBudget, Depends(owned_budget)]


def insert_budget(db: Session, user_id: int, month: date, plan: Plan) -> MonthlyBudget:
    lock_owner(db, user_id)
    statement = (
        insert(MonthlyBudget)
        .values(user_id=user_id, month=month, **plan.column_values())
        .on_conflict_do_nothing(constraint="uq_budgets_user_month")
        .returning(MonthlyBudget)
    )
    budget = db.scalar(statement)
    if budget is None:
        raise HTTPException(status_code=409, detail="You already have a budget for that month.")
    schedule_for_budget(db, budget)
    return budget


@router.get("")
def list_budgets(db: Database, user: CurrentUser) -> list[BudgetView]:
    budgets = db.scalars(
        select(MonthlyBudget).where(MonthlyBudget.user_id == user.id).order_by(MonthlyBudget.month.desc())
    )
    return [budget_view(budget) for budget in budgets]


@router.post("", status_code=201)
def create_budget(payload: CreateBudget, db: Database, user: CurrentUser) -> BudgetView:
    month = month_start(payload.month)
    plan: Plan = payload
    if payload.copy_previous:
        previous_month = (month - timedelta(days=1)).replace(day=1)
        previous = db.scalar(
            select(MonthlyBudget).where(
                MonthlyBudget.user_id == user.id,
                MonthlyBudget.month == previous_month,
            )
        )
        if previous is None:
            raise HTTPException(status_code=404, detail="You have no budget for the previous month.")
        plan = budget_view(previous)
    budget = insert_budget(db, user.id, month, plan)
    db.commit()
    return budget_view(budget)


@router.get("/{budget_id}")
def read_budget(budget: OwnedBudget) -> BudgetView:
    return budget_view(budget)


@router.put("/{budget_id}")
def update_plan(payload: Plan, budget: OwnedBudget, db: Database) -> BudgetView:
    columns = payload.column_values()
    for category in CATEGORIES:
        if category not in payload.allocations.model_fields_set:
            columns.pop(f"{category}_cents")
    for column, cents in columns.items():
        setattr(budget, column, cents)
    db.commit()
    return budget_view(budget)


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget: OwnedBudget, db: Database) -> Response:
    lock_owner(db, budget.user_id)
    db.execute(delete(MonthlyBudget).where(MonthlyBudget.id == budget.id, MonthlyBudget.user_id == budget.user_id))
    db.commit()
    return Response(status_code=204)
