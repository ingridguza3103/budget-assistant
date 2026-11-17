import secrets
import unittest

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models import User


def client() -> AsyncClient:
    address = ".".join(str(octet) for octet in [10, *secrets.token_bytes(3)])
    return AsyncClient(
        transport=ASGITransport(app=app, client=(address, 41000)),
        base_url=settings.app_origin,
        headers={"Origin": settings.app_origin},
    )


def remove_account(username: str) -> None:
    with SessionLocal.begin() as db:
        db.execute(delete(User).where(User.username == username))


def plan(income: int = 250_000) -> dict:
    return {
        "planned_income_cents": income,
        "allocations": {"bills": 125_000, "everyday": 42_000, "savings": 30_000, "debt": 10_000},
    }


class BudgetTestCase(unittest.IsolatedAsyncioTestCase):
    async def account(self) -> AsyncClient:
        session = await self.enterAsyncContext(client())
        username = f"BudgetTest{secrets.token_hex(6)}"
        self.addCleanup(remove_account, username)
        response = await session.post("/api/auth/signup", json={"username": username, "password": "Demo8abc"})
        self.assertEqual(response.status_code, 201, response.text)
        return session

    async def new_budget(self, session: AsyncClient, month: str = "2026-11") -> dict:
        response = await session.post("/api/budgets", json={"month": month, **plan()})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()


class MonthlyPlanTest(BudgetTestCase):
    async def test_copies_the_previous_calendar_month_for_the_same_account(self) -> None:
        owner = await self.account()
        previous = await self.new_budget(owner, "2026-12")
        stranger = await self.account()
        payload = {"month": "2027-01", **plan(0), "copy_previous": True}

        denied = await stranger.post("/api/budgets", json=payload)
        self.assertEqual(denied.status_code, 404)
        copied = await owner.post("/api/budgets", json=payload)
        self.assertEqual(copied.status_code, 201, copied.text)
        self.assertEqual(copied.json(), {**previous, "id": copied.json()["id"], "month": "2027-01"})
        self.assertNotEqual(copied.json()["id"], previous["id"])
        self.assertEqual((await owner.post("/api/budgets", json=payload)).status_code, 409)

    async def test_creates_lists_and_edits_plans_for_one_account(self) -> None:
        owner = await self.account()
        self.assertEqual((await owner.get("/api/budgets")).json(), [])
        november = await self.new_budget(owner)
        december = await self.new_budget(owner, "2026-12")
        self.assertEqual(november["planned_remainder_cents"], 43_000)
        self.assertEqual((await owner.get("/api/budgets")).json(), [december, november])

        path = f"/api/budgets/{november['id']}"
        changed = await owner.put(path, json=plan(200_000))
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["planned_remainder_cents"], -7_000)
        reopened = await owner.get(path)
        self.assertEqual(reopened.json(), changed.json())
        self.assertEqual(reopened.headers["cache-control"], "no-store")

    async def test_owner_is_required_for_listing_reading_and_writing(self) -> None:
        guest = await self.enterAsyncContext(client())
        self.assertEqual((await guest.get("/api/budgets")).status_code, 401)
        owner = await self.account()
        created = await self.new_budget(owner)
        stranger = await self.account()
        self.assertEqual((await stranger.get("/api/budgets")).json(), [])
        path = f"/api/budgets/{created['id']}"
        self.assertEqual((await stranger.get(path)).status_code, 404)
        self.assertEqual((await stranger.put(path, json=plan())).status_code, 404)
        own = await self.new_budget(stranger)
        self.assertNotEqual(own["id"], created["id"])

    async def test_rejects_duplicates_invalid_months_and_invalid_amounts(self) -> None:
        owner = await self.account()
        await self.new_budget(owner)
        duplicate = await owner.post("/api/budgets", json={"month": "2026-11", **plan()})
        self.assertEqual(duplicate.status_code, 409)

        for month, payload in [
            ("2026-13", plan()),
            ("2026-12", plan(-1)),
            ("2026-12", {**plan(), "owner_id": 12}),
            ("2026-12", {**plan(), "planned_income_cents": 12.5}),
        ]:
            invalid = await owner.post("/api/budgets", json={"month": month, **payload})
            self.assertEqual(invalid.status_code, 422, invalid.text)
        self.assertEqual(len((await owner.get("/api/budgets")).json()), 1)
