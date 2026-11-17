from uuid import uuid4

from test_budgets import BudgetTestCase


def entry(category: str = "bills", amount_cents: int = 1_500) -> dict:
    return {
        "id": str(uuid4()),
        "entry_date": "2026-11-07",
        "category": category,
        "amount_cents": amount_cents,
        "description": "  Test entry  ",
    }


class ActivityTest(BudgetTestCase):
    async def test_creates_edits_and_deletes_dated_entries_and_calculates_totals(self) -> None:
        owner = await self.account()
        budget = await self.new_budget(owner)
        path = f"/api/budgets/{budget['id']}"
        first = entry("income", 230_000)
        bill = entry("bills", 130_000)
        for payload in [first, bill, bill]:
            result = await owner.post(path + "/entries", json=payload)
            self.assertEqual(result.status_code, 201, result.text)
        summary = result.json()
        self.assertEqual(summary["income_cents"], 230_000)
        self.assertEqual(summary["outflow_cents"], 130_000)
        self.assertEqual(summary["remainder_cents"], 100_000)
        self.assertEqual(len(summary["entries"]), 2)
        self.assertEqual(summary["entries"][0]["description"], "Test entry")

        edit = {key: value for key, value in bill.items() if key != "id"}
        edit["amount_cents"] = 145_000
        entry_path = path + "/entries/" + bill["id"]
        updated = await owner.put(entry_path, json=edit)
        self.assertEqual(updated.json()["spending"]["bills"], 145_000)
        self.assertEqual(updated.json(), (await owner.get(path + "/activity")).json())
        self.assertEqual((await owner.post(path + "/entries", json=bill)).status_code, 409)
        remaining = (await owner.delete(entry_path)).json()
        self.assertEqual(remaining["remainder_cents"], 230_000)
        self.assertEqual((await owner.delete(entry_path)).json(), remaining)
        self.assertEqual((await owner.put(entry_path, json=edit)).status_code, 404)

    async def test_checks_ownership_and_rejects_invalid_dates_and_cents(self) -> None:
        owner = await self.account()
        stranger = await self.account()
        budget = await self.new_budget(owner)
        path = f"/api/budgets/{budget['id']}"
        payload = entry()
        self.assertEqual((await stranger.get(path + "/activity")).status_code, 404)
        self.assertEqual((await stranger.post(path + "/entries", json=payload)).status_code, 404)
        self.assertEqual((await stranger.delete(path + "/entries/" + payload["id"])).status_code, 404)

        for changes, status in [
            ({"entry_date": "2026-12-01"}, 400),
            ({"entry_date": 0}, 422),
            ({"entry_date": "2026-11-31"}, 422),
            ({"category": "other"}, 422),
            ({"amount_cents": 0}, 422),
        ]:
            invalid = await owner.post(path + "/entries", json={**payload, **changes})
            self.assertEqual(invalid.status_code, status, invalid.text)
        self.assertEqual((await owner.get(path + "/activity")).json()["entries"], [])
