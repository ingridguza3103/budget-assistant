from uuid import uuid4

from test_budgets import BudgetTestCase, plan


class ForecastRangeTest(BudgetTestCase):
    async def test_includes_both_range_boundaries_and_only_uses_included_actuals(self):
        owner = await self.account()
        before = await self.new_budget(owner, "2026-11")
        december = await self.new_budget(owner, "2026-12")
        await self.new_budget(owner, "2027-01")
        await self.new_budget(owner, "2027-02")
        saved = await owner.put("/api/forecast", json={
            "starting_balance_cents": 100_000, "from_month": "2026-12", "until_month": "2027-01",
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        report = saved.json()
        self.assertEqual([row["month"] for row in report["months"]], ["2026-12", "2027-01"])
        self.assertEqual(report["planned_end_balance_cents"], 186_000)
        self.assertEqual(report["forecast_end_balance_cents"], 186_000)
        before_path = f"/api/budgets/{before['id']}/forecast"
        self.assertEqual((await owner.put(before_path, json={"use_actuals": True})).json(), report)
        path = f"/api/budgets/{december['id']}"
        await owner.post(path + "/entries", json={
            "id": str(uuid4()), "entry_date": "2026-12-20", "category": "income", "amount_cents": 115_000,
        })
        actual = (await owner.put(path + "/forecast", json={"use_actuals": True})).json()
        self.assertEqual(actual["planned_end_balance_cents"], 186_000)
        self.assertEqual(actual["forecast_end_balance_cents"], 258_000)
        self.assertEqual(actual["actual_balance_cents"], 215_000)
        self.assertEqual(actual["actual_through_month"], "2026-12")
        self.assertEqual(actual["until_month"], "2027-01")
        self.assertEqual((await owner.get("/api/forecast")).json(), actual)

    async def test_validates_persists_and_clears_the_upper_limit(self):
        owner, stranger = await self.account(), await self.account()
        for month in ("2027-01", "2027-02", "2027-03"):
            await self.new_budget(owner, month)
        settings = {"starting_balance_cents": -100_000, "from_month": "2027-02", "until_month": "2027-02"}
        saved = await owner.put("/api/forecast", json=settings)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual([row["month"] for row in saved.json()["months"]], ["2027-02"])
        self.assertEqual(saved.json()["forecast_end_balance_cents"], -57_000)
        for changes in (
            {"until_month": "2027-01"}, {"until_month": "2027-13"}, {"until_month": True},
            {"from_month": "2027-03"}, {"from_month": "2027-03", "starting_balance_cents": 999},
        ):
            with self.subTest(changes=changes):
                response = await owner.put("/api/forecast", json={**settings, **changes})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual((await owner.get("/api/forecast")).json(), saved.json())
        legacy = await owner.put("/api/forecast", json={"starting_balance_cents": -100_000, "from_month": "2027-02"})
        self.assertEqual(legacy.json(), saved.json())
        self.assertIsNone((await stranger.get("/api/forecast")).json()["until_month"])
        open_end = (await owner.put("/api/forecast", json={**settings, "until_month": None})).json()
        self.assertEqual([row["month"] for row in open_end["months"]], ["2027-02", "2027-03"])
        upper_only = (await owner.put("/api/forecast", json={
            **settings, "from_month": None, "until_month": "2027-02",
        })).json()
        self.assertEqual([row["month"] for row in upper_only["months"]], ["2027-01", "2027-02"])
        empty = (await owner.put("/api/forecast", json={**settings, "from_month": None, "until_month": "2026-12"})).json()
        self.assertEqual(empty["months"], [])
        self.assertEqual(empty["forecast_end_balance_cents"], -100_000)

    async def test_specific_categories_are_saved_copied_counted_and_preserved_for_old_clients(self):
        owner = await self.account()
        budget = await self.new_budget(owner, "2027-01")
        path = f"/api/budgets/{budget['id']}"
        extras = {"travel": 12_000, "gifts": 5_000, "groceries": 15_000, "other": 2_000}
        payload = {**plan(), "allocations": {**plan()["allocations"], **extras}}
        saved = await owner.put(path, json=payload)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["planned_remainder_cents"], 9_000)
        for category, amount in extras.items():
            self.assertEqual(saved.json()["allocations"][category], amount)
        legacy = await owner.put(path, json=plan())
        self.assertEqual(legacy.json(), saved.json())
        for category in ("travel", "gifts", "groceries"):
            with self.subTest(category=category):
                invalid = await owner.put(path, json={**payload, "allocations": {
                    **payload["allocations"], category: -1,
                }})
                self.assertEqual(invalid.status_code, 422)
        copied = await owner.post("/api/budgets", json={"month": "2027-02", **plan(), "copy_previous": True})
        self.assertEqual(copied.json()["allocations"], saved.json()["allocations"])
        settings = {"starting_balance_cents": -100_000, "from_month": "2027-01", "until_month": "2027-01"}
        self.assertEqual((await owner.put("/api/forecast", json=settings)).json()["forecast_end_balance_cents"], -91_000)
        amounts = {"income": 250_000, **extras}
        records = {}
        for category, amount in amounts.items():
            records[category] = str(uuid4())
            result = await owner.post(path + "/entries", json={
                "id": records[category], "entry_date": "2027-01-20", "category": category, "amount_cents": amount,
            })
            self.assertEqual(result.status_code, 201, result.text)
        summary = result.json()
        self.assertEqual(summary["outflow_cents"], 34_000)
        for category, amount in extras.items():
            self.assertEqual(summary["spending"][category], amount)
        forecast = (await owner.put(path + "/forecast", json={"use_actuals": True})).json()
        self.assertEqual(forecast["forecast_end_balance_cents"], 116_000)
        await owner.put(path + "/entries/" + records["travel"], json={
            "entry_date": "2027-01-20", "category": "gifts", "amount_cents": 12_000,
        })
        updated = (await owner.get(path + "/activity")).json()
        self.assertEqual(updated["spending"]["travel"], 0)
        self.assertEqual(updated["spending"]["gifts"], 17_000)
        await owner.delete(path + "/entries/" + records["groceries"])
        self.assertEqual((await owner.get("/api/forecast")).json()["forecast_end_balance_cents"], 131_000)
        sample = (await owner.post("/api/budgets/sample/preview", json={"month": "2027-03"})).json()
        self.assertTrue(all(sample["plan"]["allocations"][category] > 0 for category in extras))
        sample_categories = {entry["category"] for entry in sample["activity"]["entries"]}
        self.assertTrue({"travel", "gifts", "groceries"} <= sample_categories)
