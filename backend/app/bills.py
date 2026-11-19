from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool, StringConstraints
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .activity import EntryDate, PositiveCents, require_budget_date
from .budgets import OwnedBudget
from .database import Database
from .models import BillSeries, MonthlyBudget, ScheduledBill
from .recurrence import lock_owner, schedule_occurrence

router = APIRouter(prefix="/api/budgets/{budget_id}/bills", tags=["bills"])


class BillFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    due_date: EntryDate
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    amount_cents: PositiveCents


class NewBill(BillFields):
    id: UUID


class MonthlyBillInput(NewBill):
    source_bill_id: UUID | None = None


class SeriesInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    start_month: date
    end_month: date | None
    due_day: int


class BillView(NewBill):
    model_config = ConfigDict(from_attributes=True)

    paid: bool
    series: SeriesInfo | None = None


class BillStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paid: StrictBool


def bill_list(db: Session, budget_id: int) -> list[BillView]:
    rows = db.execute(
        select(ScheduledBill, BillSeries).outerjoin(BillSeries, ScheduledBill.series_id == BillSeries.id)
        .where(ScheduledBill.budget_id == budget_id)
        .order_by(ScheduledBill.due_date, ScheduledBill.id)
    )
    result = []
    for bill, rule in rows:
        view = BillView.model_validate(bill)
        if rule is not None:
            view.series = SeriesInfo.model_validate(rule)
        result.append(view)
    return result


@router.get("", response_model_exclude_none=True)
def list_bills(budget: OwnedBudget, db: Database) -> list[BillView]:
    return bill_list(db, budget.id)


@router.post("", status_code=201, response_model_exclude_none=True)
def add_bill(payload: NewBill, budget: OwnedBudget, db: Database) -> list[BillView]:
    require_budget_date(payload.due_date, budget)
    statement = (
        insert(ScheduledBill)
        .values(budget_id=budget.id, paid=False, **payload.model_dump())
        .on_conflict_do_nothing(index_elements=["id"])
        .returning(ScheduledBill.id)
    )
    if db.scalar(statement) is None:
        existing = db.get(ScheduledBill, payload.id)
        if (
            existing is None
            or existing.budget_id != budget.id
            or BillView.model_validate(existing).model_dump(exclude={"paid", "series"}) != payload.model_dump()
        ):
            raise HTTPException(status_code=409, detail="This bill already has different details.")
    result = bill_list(db, budget.id)
    db.commit()
    return result


@router.put("/{bill_id}", response_model_exclude_none=True)
def edit_bill(bill_id: UUID, payload: BillFields, budget: OwnedBudget, db: Database) -> list[BillView]:
    require_budget_date(payload.due_date, budget)
    statement = (
        update(ScheduledBill).where(ScheduledBill.id == bill_id, ScheduledBill.budget_id == budget.id)
        .values(**payload.model_dump()).returning(ScheduledBill.id)
    )
    if db.scalar(statement) is None:
        raise HTTPException(status_code=404, detail="Bill not found.")
    result = bill_list(db, budget.id)
    db.commit()
    return result


@router.put("/{bill_id}/status", response_model_exclude_none=True)
def set_paid(bill_id: UUID, payload: BillStatus, budget: OwnedBudget, db: Database) -> list[BillView]:
    statement = (
        update(ScheduledBill)
        .where(ScheduledBill.id == bill_id, ScheduledBill.budget_id == budget.id)
        .values(paid=payload.paid)
        .returning(ScheduledBill.id)
    )
    if db.scalar(statement) is None:
        raise HTTPException(status_code=404, detail="Bill not found.")
    result = bill_list(db, budget.id)
    db.commit()
    return result


@router.delete("/{bill_id}", response_model_exclude_none=True)
def remove_bill(bill_id: UUID, budget: OwnedBudget, db: Database) -> list[BillView]:
    db.execute(delete(ScheduledBill).where(ScheduledBill.id == bill_id, ScheduledBill.budget_id == budget.id))
    result = bill_list(db, budget.id)
    db.commit()
    return result

def lock_budget_owner(db: Session, budget: MonthlyBudget) -> None:
    lock_owner(db, budget.user_id)
    if db.scalar(select(MonthlyBudget.id).where(MonthlyBudget.id == budget.id)) is None:
        raise HTTPException(status_code=404, detail="Budget not found.")


@router.post("/monthly", status_code=201, response_model_exclude_none=True)
def add_monthly_bill(payload: MonthlyBillInput, budget: OwnedBudget, db: Database) -> list[BillView]:
    require_budget_date(payload.due_date, budget)
    lock_budget_owner(db, budget)
    source = None
    if payload.source_bill_id:
        source = db.scalar(select(ScheduledBill).where(
            ScheduledBill.id == payload.source_bill_id, ScheduledBill.budget_id == budget.id).with_for_update())
        if source is None:
            raise HTTPException(status_code=404, detail="Bill not found.")
        if source.series_id not in (None, payload.id):
            raise HTTPException(status_code=409, detail="This bill already repeats monthly.")
    values = dict(id=payload.id, user_id=budget.user_id, start_month=budget.month,
                  due_day=payload.due_date.day, name=payload.name, amount_cents=payload.amount_cents)
    rule = db.scalar(insert(BillSeries).values(**values).on_conflict_do_nothing(
        index_elements=["id"]).returning(BillSeries))
    if rule is None:
        previous = db.get(BillSeries, payload.id)
        if (previous is None or (source is not None and source.series_id != previous.id)
                or any(getattr(previous, key) != value for key, value in values.items())):
            raise HTTPException(status_code=409, detail="The monthly bill already has different details.")
        # A retry must respect an occurrence the user has since removed or edited.
    else:
        if source is not None:
            source.series_id = rule.id
            source.name, source.amount_cents, source.due_date = payload.name, payload.amount_cents, payload.due_date
            db.flush()
        months = db.scalars(select(MonthlyBudget).where(
            MonthlyBudget.user_id == budget.user_id, MonthlyBudget.month >= budget.month))
        for month in months:
            schedule_occurrence(db, rule, month)
    result = bill_list(db, budget.id)
    db.commit()
    return result


@router.post("/monthly/{series_id}/stop", response_model_exclude_none=True)
def stop_monthly_bill(series_id: UUID, budget: OwnedBudget, db: Database) -> list[BillView]:
    lock_budget_owner(db, budget)
    rule = db.scalar(select(BillSeries).where(
        BillSeries.id == series_id, BillSeries.user_id == budget.user_id, BillSeries.start_month <= budget.month))
    if rule is None:
        raise HTTPException(status_code=404, detail="Monthly bill not found.")
    cutoff = min(rule.end_month, budget.month) if rule.end_month else budget.month
    rule.end_month = cutoff
    future = select(MonthlyBudget.id).where(MonthlyBudget.user_id == budget.user_id, MonthlyBudget.month > cutoff)
    db.execute(delete(ScheduledBill).where(ScheduledBill.series_id == series_id,
               ScheduledBill.budget_id.in_(future), ScheduledBill.paid.is_(False)))
    result = bill_list(db, budget.id)
    db.commit()
    return result
