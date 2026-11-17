from uuid import uuid4

from test_budgets import BudgetTestCase


class BillCalendarTest(BudgetTestCase):
    async def test_adds_marks_unmarks_and_removes_bills_without_posting_activity(self) -> None:
        owner = await self.account()
        budget = await self.new_budget(owner)
        base = f"/api/budgets/{budget['id']}"
        path = base + "/bills"
        bill = {"id": str(uuid4()), "due_date": "2026-11-14", "name": "Electricity", "amount_cents": 9_543}
        self.assertEqual((await owner.get(path)).json(), [])
        for _ in range(2):
            result = await owner.post(path, json=bill)
            self.assertEqual(result.status_code, 201, result.text)
            self.assertEqual(result.json(), [{**bill, "paid": False}])
        self.assertEqual((await owner.post(path, json={**bill, "name": "Rent"})).status_code, 409)
        status_path = f"{path}/{bill['id']}/status"
        self.assertEqual((await owner.put(status_path, json={"paid": True})).json(), [{**bill, "paid": True}])
        self.assertEqual((await owner.get(base + "/activity")).json()["entries"], [])
        self.assertEqual((await owner.put(status_path, json={"paid": False})).json(), [{**bill, "paid": False}])
        self.assertEqual((await owner.delete(f"{path}/{bill['id']}")).json(), [])
        self.assertEqual((await owner.put(status_path, json={"paid": True})).status_code, 404)

    async def test_requires_ownership_and_the_budget_month(self) -> None:
        owner = await self.account()
        stranger = await self.account()
        budget = await self.new_budget(owner)
        path = f"/api/budgets/{budget['id']}/bills"
        bill = {"id": str(uuid4()), "due_date": "2026-12-01", "name": "Rent", "amount_cents": 80_000}
        self.assertEqual((await stranger.get(path)).status_code, 404)
        self.assertEqual((await stranger.post(path, json=bill)).status_code, 404)
        self.assertEqual((await stranger.put(f"{path}/{bill['id']}/status", json={"paid": True})).status_code, 404)
        self.assertEqual((await owner.post(path, json=bill)).status_code, 400)
