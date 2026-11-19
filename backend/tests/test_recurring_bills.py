import asyncio
from uuid import uuid4

from test_budgets import BudgetTestCase, plan


class RecurringBillsTest(BudgetTestCase):
    async def test_generates_one_per_eligible_month_and_keeps_the_original_due_day(self):
        owner, other = await self.account(), await self.account()
        async def month(value):
            budget = await self.new_budget(owner, value)
            return f"/api/budgets/{budget['id']}"
        december = await month("2027-12")
        january = await month("2028-01")
        march = await month("2028-03")
        foreign = await self.new_budget(other, "2028-02")
        rule = {"id": str(uuid4()), "name": "Rent", "due_date": "2028-01-31", "amount_cents": 82500}
        start = january + "/bills/monthly"
        feb_response, first, retry = await asyncio.gather(
            owner.post("/api/budgets", json={"month": "2028-02", **plan()}),
            owner.post(start, json=rule), owner.post(start, json=rule))
        for response in (feb_response, first, retry):
            self.assertEqual(response.status_code, 201, response.text)
        feb = f"/api/budgets/{feb_response.json()['id']}"
        for path, date in [(january, "2028-01-31"), (feb, "2028-02-29"), (march, "2028-03-31")]:
            bills = (await owner.get(path + "/bills")).json()
            self.assertEqual(len(bills), 1)
            self.assertEqual(bills[0]["due_date"], date)
            self.assertEqual(bills[0]["series"]["due_day"], 31)
            self.assertEqual((await owner.get(path + "/activity")).json()["outflow_cents"], 0)
        self.assertEqual((await owner.get(december + "/bills")).json(), [])
        self.assertEqual((await other.get(f"/api/budgets/{foreign['id']}/bills")).json(), [])
        self.assertEqual((await owner.post(start, json={**rule, "name": "Changed"})).status_code, 409)
        bill = (await owner.get(january + "/bills")).json()[0]
        await owner.delete(january + "/bills/" + bill["id"])
        self.assertEqual((await owner.post(start, json=rule)).json(), [])
        self.assertEqual((await owner.delete(january)).status_code, 204)
        recreated = await month("2028-01")
        self.assertEqual(len((await owner.get(recreated + "/bills")).json()), 1)

    async def test_stop_keeps_paid_history_and_individual_edits(self):
        owner, stranger = await self.account(), await self.account()
        async def path(value):
            budget = await self.new_budget(owner, value)
            return f"/api/budgets/{budget['id']}/bills"
        jan, feb, mar = [await path(value) for value in ("2027-01", "2027-02", "2027-03")]
        rule = {"id": str(uuid4()), "name": "Internet", "due_date": "2027-01-31", "amount_cents": 2000}
        await owner.post(jan + "/monthly", json=rule)
        feb_bill = (await owner.get(feb)).json()[0]
        self.assertEqual(feb_bill["due_date"], "2027-02-28")
        await owner.put(feb + "/" + feb_bill["id"], json={"name": "February only", "amount_cents": 1700, "due_date": "2027-02-15"})
        await owner.put(feb + "/" + feb_bill["id"] + "/status", json={"paid": True})
        endpoint = jan + "/monthly/" + rule["id"] + "/stop"
        self.assertEqual((await stranger.post(endpoint)).status_code, 404)
        for _ in range(2):
            stopped = await owner.post(endpoint)
            self.assertEqual(stopped.json()[0]["series"]["end_month"], "2027-01-01")
            self.assertFalse(stopped.json()[0]["paid"])
        self.assertEqual((await owner.get(feb)).json()[0]["name"], "February only")
        self.assertEqual((await owner.get(mar)).json(), [])
        april = await path("2027-04")
        self.assertEqual((await owner.get(april)).json(), [])

    async def test_converts_an_existing_paid_bill_without_duplicating_its_first_occurrence(self):
        owner = await self.account()
        month = await self.new_budget(owner)
        path = f"/api/budgets/{month['id']}/bills"
        bill = {"id": str(uuid4()), "name": "Gym", "due_date": "2026-11-05", "amount_cents": 3000}
        await owner.post(path, json=bill)
        await owner.put(path + "/" + bill["id"] + "/status", json={"paid": True})
        repeat = {**bill, "id": str(uuid4()), "source_bill_id": bill["id"]}
        for _ in range(2):
            response = await owner.post(path + "/monthly", json=repeat)
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(len(response.json()), 1)
            item = response.json()[0]
            self.assertEqual(item["id"], bill["id"])
            self.assertTrue(item["paid"])
        self.assertEqual((await owner.post(path + "/monthly", json={**repeat, "id": str(uuid4())})).status_code, 409)
        december = await self.new_budget(owner, "2026-12")
        future = (await owner.get(f"/api/budgets/{december['id']}/bills")).json()
        self.assertFalse(future[0]["paid"])
