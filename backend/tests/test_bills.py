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

    async def test_sample_preview_and_saved_copy_have_activity_and_bills(self) -> None:
        owner = await self.account()
        payload = {"month": "2028-02"}
        preview = await owner.post("/api/budgets/sample/preview", json=payload)
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual((await owner.get("/api/budgets")).json(), [])
        self.assertEqual(len(preview.json()["activity"]["entries"]), 7)
        self.assertEqual([bill["paid"] for bill in preview.json()["bills"]], [True, False])
        saved = await owner.post("/api/budgets/sample", json=payload)
        base = f"/api/budgets/{saved.json()['id']}"
        self.assertEqual((await owner.post("/api/budgets/sample", json=payload)).status_code, 409)
        self.assertEqual(len((await owner.get(base + "/bills")).json()), 2)
        self.assertEqual((await owner.get(base + "/activity")).json()["outflow_cents"], preview.json()["activity"]["outflow_cents"])

    async def test_edits_only_the_owners_bill_and_keeps_payment_status(self) -> None:
        owner, stranger = await self.account(), await self.account()
        budget = await self.new_budget(owner)
        path = f"/api/budgets/{budget['id']}/bills"
        fields = {"name": "Rent", "due_date": "2026-11-01", "amount_cents": 3000}
        record = str(uuid4())
        await owner.post(path, json={"id": record, **fields})
        await owner.put(f"{path}/{record}/status", json={"paid": True})
        endpoint = f"{path}/{record}"
        self.assertEqual((await stranger.put(endpoint, json=fields)).status_code, 404)
        self.assertEqual((await owner.put(endpoint, json={**fields, "due_date": "2026-12-01"})).status_code, 400)
        result = await owner.put(endpoint, json={**fields, "name": "Updated"})
        self.assertEqual(result.json()[0]["name"], "Updated")
        self.assertTrue(result.json()[0]["paid"])
