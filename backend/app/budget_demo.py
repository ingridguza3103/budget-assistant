from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from .activity import ActivityView, EntryCategory, EntryView, insert_entry, summarize_entries
from .bills import BillView
from .models import ScheduledBill
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
    (15, "other", "Birthday gift", 3_500),
)


class SampleMonth(BaseModel):
    model_config = ConfigDict(extra="forbid")

    month: Month


class SamplePreview(BaseModel):
    plan: Plan
    activity: ActivityView
    bills: list[BillView]


def sample_for(payload: SampleMonth) -> SamplePreview:
    month = month_start(payload.month)
    plan = Plan(
        planned_income_cents=245_000,
        allocations=Allocations(bills=115_000, everyday=48_000, savings=40_000, debt=25_000, other=10_000),
    )
    entries = [EntryView(id=uuid4(), entry_date=month.replace(day=day), category=category,
                         description=description, amount_cents=cents)
               for day, category, description, cents in reversed(sample_entries)]
    bills = [BillView(id=uuid4(), due_date=month.replace(day=day), name=name, amount_cents=cents, paid=paid)
             for day, name, cents, paid in [(2, "Rent", 89_000, True), (18, "Internet", 4_000, False)]]
    return SamplePreview(plan=plan, activity=summarize_entries(entries), bills=bills)


@router.post("/sample/preview")
def preview_sample_month(payload: SampleMonth, user: CurrentUser) -> SamplePreview:
    return sample_for(payload)


@router.post("/sample", status_code=201)
def add_sample_month(payload: SampleMonth, db: Database, user: CurrentUser) -> BudgetView:
    sample = sample_for(payload)
    budget = insert_budget(db, user.id, month_start(payload.month), sample.plan)
    for entry in sample.activity.entries:
        insert_entry(db, budget, entry)
    for bill in sample.bills:
        db.add(ScheduledBill(budget_id=budget.id, **bill.model_dump(exclude={"series"})))
    db.commit()
    return budget_view(budget)
