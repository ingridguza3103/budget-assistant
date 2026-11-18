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
from .models import ScheduledBill

router = APIRouter(prefix="/api/budgets/{budget_id}/bills", tags=["bills"])


class BillFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    due_date: EntryDate
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    amount_cents: PositiveCents


class NewBill(BillFields):
    id: UUID


class BillView(NewBill):
    model_config = ConfigDict(from_attributes=True)

    paid: bool


class BillStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paid: StrictBool


def bill_list(db: Session, budget_id: int) -> list[BillView]:
    rows = db.scalars(
        select(ScheduledBill)
        .where(ScheduledBill.budget_id == budget_id)
        .order_by(ScheduledBill.due_date, ScheduledBill.id)
    )
    return [BillView.model_validate(row) for row in rows]


@router.get("")
def list_bills(budget: OwnedBudget, db: Database) -> list[BillView]:
    return bill_list(db, budget.id)


@router.post("", status_code=201)
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
            or BillView.model_validate(existing).model_dump(exclude={"paid"}) != payload.model_dump()
        ):
            raise HTTPException(status_code=409, detail="This bill already has different details.")
    result = bill_list(db, budget.id)
    db.commit()
    return result


@router.put("/{bill_id}")
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


@router.put("/{bill_id}/status")
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


@router.delete("/{bill_id}")
def remove_bill(bill_id: UUID, budget: OwnedBudget, db: Database) -> list[BillView]:
    db.execute(delete(ScheduledBill).where(ScheduledBill.id == bill_id, ScheduledBill.budget_id == budget.id))
    result = bill_list(db, budget.id)
    db.commit()
    return result
