from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, computed_field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import Database
from .models import MAX_CENTS, MonthlyBudget, User

router = APIRouter(prefix="/api/budgets", tags=["budgets"])
CurrentUser = Annotated[User, Depends(get_current_user)]
Category = Literal["bills", "everyday", "savings", "debt"]
CATEGORIES: tuple[Category, ...] = ("bills", "everyday", "savings", "debt")
Month = Annotated[str, Field(pattern=r"^(19[0-9]{2}|[2-9][0-9]{3})-(0[1-9]|1[0-2])$")]
Cents = Annotated[int, Field(strict=True, ge=0, le=MAX_CENTS)]


class Allocations(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bills: Cents
    everyday: Cents
    savings: Cents
    debt: Cents


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
    statement = (
        insert(MonthlyBudget)
        .values(user_id=user_id, month=month, **plan.column_values())
        .on_conflict_do_nothing(constraint="uq_budgets_user_month")
        .returning(MonthlyBudget)
    )
    budget = db.scalar(statement)
    if budget is None:
        raise HTTPException(status_code=409, detail="You already have a budget for that month.")
    return budget


@router.get("")
def list_budgets(db: Database, user: CurrentUser) -> list[BudgetView]:
    budgets = db.scalars(
        select(MonthlyBudget).where(MonthlyBudget.user_id == user.id).order_by(MonthlyBudget.month.desc())
    )
    return [budget_view(budget) for budget in budgets]


@router.post("", status_code=201)
def create_budget(payload: CreateBudget, db: Database, user: CurrentUser) -> BudgetView:
    budget = insert_budget(db, user.id, month_start(payload.month), payload)
    db.commit()
    return budget_view(budget)


@router.get("/{budget_id}")
def read_budget(budget: OwnedBudget) -> BudgetView:
    return budget_view(budget)


@router.put("/{budget_id}")
def update_plan(payload: Plan, budget: OwnedBudget, db: Database) -> BudgetView:
    for column, cents in payload.column_values().items():
        setattr(budget, column, cents)
    db.commit()
    return budget_view(budget)
