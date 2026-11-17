import re
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .budgets import CATEGORIES, Category, OwnedBudget
from .database import Database
from .models import MAX_CENTS, BudgetEntry, MonthlyBudget

router = APIRouter(prefix="/api/budgets/{budget_id}", tags=["activity"])
EntryCategory = Literal["income", "bills", "everyday", "savings", "debt"]
PositiveCents = Annotated[int, Field(strict=True, ge=1, le=MAX_CENTS)]


def check_iso_date(value: object) -> date | str:
    if type(value) is date:
        return value
    if isinstance(value, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        return value
    raise ValueError("Use a date in YYYY-MM-DD format.")


EntryDate = Annotated[date, BeforeValidator(check_iso_date)]


class EntryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry_date: EntryDate
    category: EntryCategory
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=140)] = ""
    amount_cents: PositiveCents


class NewEntry(EntryInput):
    id: UUID


class EntryView(NewEntry):
    model_config = ConfigDict(from_attributes=True)


class ActivityView(BaseModel):
    entries: list[EntryView]
    income_cents: int
    outflow_cents: int
    remainder_cents: int
    spending: dict[Category, int]


def require_budget_date(day: date, budget: MonthlyBudget) -> None:
    if day.replace(day=1) != budget.month:
        raise HTTPException(status_code=400, detail="Choose a date in this budget’s month.")


def activity_view(db: Session, budget: MonthlyBudget) -> ActivityView:
    records = db.scalars(
        select(BudgetEntry)
        .where(BudgetEntry.budget_id == budget.id)
        .order_by(BudgetEntry.entry_date.desc(), BudgetEntry.id)
    )
    entries = [EntryView.model_validate(record) for record in records]
    spending = {category: 0 for category in CATEGORIES}
    income = 0
    for entry in entries:
        if entry.category == "income":
            income += entry.amount_cents
        else:
            spending[entry.category] += entry.amount_cents
    outflow = sum(spending.values())
    return ActivityView(
        entries=entries,
        income_cents=income,
        outflow_cents=outflow,
        remainder_cents=income - outflow,
        spending=spending,
    )


def insert_entry(db: Session, budget: MonthlyBudget, payload: NewEntry) -> None:
    require_budget_date(payload.entry_date, budget)
    statement = (
        insert(BudgetEntry)
        .values(budget_id=budget.id, **payload.model_dump())
        .on_conflict_do_nothing(index_elements=["id"])
        .returning(BudgetEntry.id)
    )
    if db.scalar(statement) is None:
        existing = db.get(BudgetEntry, payload.id)
        if (
            existing is None
            or existing.budget_id != budget.id
            or EntryView.model_validate(existing).model_dump() != payload.model_dump()
        ):
            raise HTTPException(status_code=409, detail="This entry changed. Reopen the month and try again.")


def commit_activity(db: Session, budget: MonthlyBudget) -> ActivityView:
    result = activity_view(db, budget)
    db.commit()
    return result


@router.get("/activity")
def read_activity(budget: OwnedBudget, db: Database) -> ActivityView:
    return activity_view(db, budget)


@router.post("/entries", status_code=201)
def add_entry(payload: NewEntry, budget: OwnedBudget, db: Database) -> ActivityView:
    insert_entry(db, budget, payload)
    return commit_activity(db, budget)


@router.put("/entries/{entry_id}")
def edit_entry(entry_id: UUID, payload: EntryInput, budget: OwnedBudget, db: Database) -> ActivityView:
    require_budget_date(payload.entry_date, budget)
    entry = db.scalar(
        select(BudgetEntry)
        .where(BudgetEntry.id == entry_id, BudgetEntry.budget_id == budget.id)
        .with_for_update()
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    for column, value in payload.model_dump().items():
        setattr(entry, column, value)
    return commit_activity(db, budget)


@router.delete("/entries/{entry_id}")
def remove_entry(entry_id: UUID, budget: OwnedBudget, db: Database) -> ActivityView:
    db.execute(delete(BudgetEntry).where(BudgetEntry.id == entry_id, BudgetEntry.budget_id == budget.id))
    return commit_activity(db, budget)
