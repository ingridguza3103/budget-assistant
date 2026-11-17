from datetime import date, datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("username", name="uq_users_username"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64, collation="C"))
    password_hash: Mapped[str] = mapped_column(Text)


class LoginSession(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AuthThrottle(Base):
    __tablename__ = "auth_throttles"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window: Mapped[int] = mapped_column(primary_key=True, index=True)
    attempts: Mapped[int]


MAX_CENTS = 99_999_999


class MonthlyBudget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "month", name="uq_budgets_user_month"),
        CheckConstraint("EXTRACT(DAY FROM month) = 1", name="ck_budgets_month_start"),
        CheckConstraint(
            f"planned_income_cents BETWEEN 0 AND {MAX_CENTS} "
            f"AND bills_cents BETWEEN 0 AND {MAX_CENTS} "
            f"AND everyday_cents BETWEEN 0 AND {MAX_CENTS} "
            f"AND savings_cents BETWEEN 0 AND {MAX_CENTS} "
            f"AND debt_cents BETWEEN 0 AND {MAX_CENTS}",
            name="ck_budgets_amounts",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    month: Mapped[date] = mapped_column(Date)
    planned_income_cents: Mapped[int]
    bills_cents: Mapped[int]
    everyday_cents: Mapped[int]
    savings_cents: Mapped[int]
    debt_cents: Mapped[int]


class BudgetEntry(Base):
    __tablename__ = "budget_entries"
    __table_args__ = (
        CheckConstraint(
            "category IN ('income', 'bills', 'everyday', 'savings', 'debt')",
            name="ck_entries_category",
        ),
        CheckConstraint(f"amount_cents BETWEEN 1 AND {MAX_CENTS}", name="ck_entries_amount"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id", ondelete="CASCADE"), index=True)
    entry_date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(String(140))
    amount_cents: Mapped[int]


class ScheduledBill(Base):
    __tablename__ = "scheduled_bills"
    __table_args__ = (
        CheckConstraint(f"amount_cents BETWEEN 1 AND {MAX_CENTS}", name="ck_bills_amount"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id", ondelete="CASCADE"), index=True)
    due_date: Mapped[date] = mapped_column(Date)
    name: Mapped[str] = mapped_column(String(80))
    amount_cents: Mapped[int]
    paid: Mapped[bool]
