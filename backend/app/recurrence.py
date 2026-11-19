import calendar
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import BillSeries, MonthlyBudget, ScheduledBill, User


def lock_owner(db: Session, user_id: int) -> None:
    # Serialize month creation and rule changes so either side sees the other's commit.
    db.execute(select(User.id).where(User.id == user_id).with_for_update())


def schedule_occurrence(db: Session, rule: BillSeries, budget: MonthlyBudget) -> None:
    month = budget.month
    day = min(rule.due_day, calendar.monthrange(month.year, month.month)[1])
    db.execute(insert(ScheduledBill).values(
        id=uuid4(), series_id=rule.id, budget_id=budget.id, due_date=month.replace(day=day),
        name=rule.name, amount_cents=rule.amount_cents, paid=False,
    ).on_conflict_do_nothing(constraint="uq_series_budget"))


def schedule_for_budget(db: Session, budget: MonthlyBudget) -> None:
    rules = db.scalars(select(BillSeries).where(
        BillSeries.user_id == budget.user_id, BillSeries.start_month <= budget.month,
        or_(BillSeries.end_month.is_(None), BillSeries.end_month >= budget.month),
    ))
    for rule in rules:
        schedule_occurrence(db, rule, budget)
