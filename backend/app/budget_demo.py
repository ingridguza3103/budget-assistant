from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from .activity import EntryCategory, NewEntry, insert_entry
from .budgets import Allocations, BudgetView, CurrentUser, Month, Plan, budget_view, insert_budget, month_start
from .database import Database

router = APIRouter(prefix="/api/budgets", tags=["budgets"])
sample_entries: tuple[tuple[int, EntryCategory, str, int], ...] = (
    (1, "income", "Sample salary", 245_000),
    (2, "bills", "Rent", 89_000),
    (3, "bills", "Electricity", 7_500),
    (5, "everyday", "Groceries", 6_340),
    (8, "everyday", "Bus pass", 4_900),
    (10, "savings", "Emergency fund", 20_000),
    (12, "debt", "Loan payment", 27_500),
)


class SampleMonth(BaseModel):
    model_config = ConfigDict(extra="forbid")

    month: Month


@router.post("/sample", status_code=201)
def add_sample_month(payload: SampleMonth, db: Database, user: CurrentUser) -> BudgetView:
    month = month_start(payload.month)
    plan = Plan(
        planned_income_cents=245_000,
        allocations=Allocations(bills=115_000, everyday=48_000, savings=40_000, debt=25_000),
    )
    budget = insert_budget(db, user.id, month, plan)
    for day, category, description, cents in sample_entries:
        insert_entry(db, budget, NewEntry(
            id=uuid4(),
            entry_date=month.replace(day=day),
            category=category,
            description=description,
            amount_cents=cents,
        ))
    db.commit()
    return budget_view(budget)
