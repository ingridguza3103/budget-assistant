from uuid import uuid4

from test_budgets import BudgetTestCase, client, plan


def annual_plan(income: int = 200_000) -> dict:
    return {
        "planned_income_cents": income,
        "allocations": {"bills": 75_000, "everyday": 40_000, "savings": 10_000, "debt": 5_000, "other": 10_000},
    }


class ForecastTest(BudgetTestCase):
    async def test_stores_signed_starting_balances_and_validates_settings(self):
        owner = await self.account()
        empty = await owner.get("/api/forecast")
        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.headers["cache-control"], "no-store")
        self.assertEqual(empty.json()["months"], [])
        self.assertEqual(empty.json()["forecast_end_balance_cents"], 0)
        for balance in (-99_999_999, -100_050, 0, 100_000, 99_999_999):
            saved = await owner.put("/api/forecast", json={"starting_balance_cents": balance})
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertEqual(saved.json()["forecast_end_balance_cents"], balance)
            self.assertEqual((await owner.get("/api/forecast")).json(), saved.json())
        for changes in (
            {"starting_balance_cents": -100_000_000}, {"starting_balance_cents": 1.5},
            {"starting_balance_cents": True}, {"starting_balance_cents": "100"},
            {"starting_balance_cents": 100, "from_month": "2027-13"},
            {"starting_balance_cents": 100, "user_id": 1},
        ):
            self.assertEqual((await owner.put("/api/forecast", json=changes)).status_code, 422)
        self.assertEqual((await owner.get("/api/forecast")).json()["starting_balance_cents"], 99_999_999)

    async def test_forecasts_a_year_without_activity_then_replaces_one_month_with_actuals(self):
        owner = await self.account()
        months = {}
        for number in reversed(range(1, 13)):
            value = f"2027-{number:02}"
            saved = await owner.post("/api/budgets", json={"month": value, **annual_plan()})
            self.assertEqual(saved.status_code, 201, saved.text)
            months[value] = saved.json()["id"]
        await owner.put("/api/forecast", json={"starting_balance_cents": 100_000, "from_month": "2027-01"})
        report = (await owner.get("/api/forecast")).json()
        self.assertEqual([row["month"] for row in report["months"]], sorted(months))
        self.assertEqual(report["planned_end_balance_cents"], 820_000)
        self.assertEqual(report["forecast_end_balance_cents"], 820_000)
        self.assertTrue(all(row["actual_balance_cents"] is None for row in report["months"]))

        base = f"/api/budgets/{months['2027-01']}"
        gift = {"id": str(uuid4()), "entry_date": "2027-01-15", "category": "other",
                "description": "Travel ticket", "amount_cents": 10_000}
        await owner.post(base + "/entries", json=gift)
        self.assertEqual((await owner.get("/api/forecast")).json()["forecast_end_balance_cents"], 820_000)
        await owner.post(base + "/entries", json={
            **gift, "id": str(uuid4()), "category": "income", "amount_cents": 200_000,
        })
        actual = await owner.put(base + "/forecast", json={"use_actuals": True})
        self.assertEqual(actual.status_code, 200, actual.text)
        report = actual.json()
        self.assertEqual(report["forecast_end_balance_cents"], 950_000)
        self.assertEqual(report["planned_end_balance_cents"], 820_000)
        self.assertEqual(report["actual_balance_cents"], 290_000)
        self.assertEqual(report["actual_through_month"], "2027-01")
        self.assertEqual(report["months"][0]["actual_balance_cents"], 290_000)
        self.assertIsNone(report["months"][1]["actual_balance_cents"])

        modified = {key: value for key, value in gift.items() if key != "id"}
        modified["amount_cents"] = 20_000
        await owner.put(base + "/entries/" + gift["id"], json=modified)
        self.assertEqual((await owner.get("/api/forecast")).json()["forecast_end_balance_cents"], 940_000)
        await owner.delete(base + "/entries/" + gift["id"])
        self.assertEqual((await owner.get("/api/forecast")).json()["forecast_end_balance_cents"], 960_000)
        await owner.put(base + "/forecast", json={"use_actuals": False})
        self.assertEqual((await owner.get("/api/forecast")).json()["forecast_end_balance_cents"], 820_000)

    async def test_actual_balances_require_a_complete_prefix_and_work_below_zero(self):
        owner = await self.account()
        january = await self.new_budget(owner, "2027-01")
        february = await self.new_budget(owner, "2027-02")
        await owner.put("/api/forecast", json={"starting_balance_cents": -100_000})
        path = f"/api/budgets/{february['id']}/forecast"
        later = (await owner.put(path, json={"use_actuals": True})).json()
        self.assertIsNone(later["actual_through_month"])
        self.assertEqual(later["actual_balance_cents"], -100_000)
        self.assertTrue(all(row["actual_balance_cents"] is None for row in later["months"]))
        first = f"/api/budgets/{january['id']}/forecast"
        for _ in range(2):
            complete = (await owner.put(first, json={"use_actuals": True})).json()
            self.assertEqual(complete["actual_through_month"], "2027-02")
            self.assertEqual(complete["actual_balance_cents"], -100_000)
            self.assertEqual(complete["forecast_end_balance_cents"], -100_000)
        changed = (await owner.put(first, json={"use_actuals": False})).json()
        self.assertIsNone(changed["actual_through_month"])
        self.assertEqual(changed["forecast_end_balance_cents"], -57_000)

    async def test_scopes_settings_and_budget_switches_to_the_signed_in_owner(self):
        guest = await self.enterAsyncContext(client())
        for response in (await guest.get("/api/forecast"),
                         await guest.put("/api/forecast", json={"starting_balance_cents": 0})):
            self.assertEqual(response.status_code, 401)
        owner, stranger = await self.account(), await self.account()
        budget = await self.new_budget(owner)
        await owner.put("/api/forecast", json={"starting_balance_cents": 100_000})
        self.assertEqual((await stranger.get("/api/forecast")).json()["months"], [])
        self.assertEqual((await stranger.get("/api/forecast")).json()["starting_balance_cents"], 0)
        path = f"/api/budgets/{budget['id']}/forecast"
        self.assertEqual((await stranger.put(path, json={"use_actuals": True})).status_code, 404)
        self.assertEqual((await owner.put(path, json={"use_actuals": "true"})).status_code, 422)
        self.assertEqual((await owner.put(path, json={"use_actuals": True, "user_id": 1})).status_code, 422)
        rejected = await owner.put("/api/forecast", json={"starting_balance_cents": 0},
                                   headers={"Origin": "https://example.invalid"})
        self.assertEqual(rejected.status_code, 403)

    async def test_start_month_excludes_history_and_deletion_recalculates_the_projection(self):
        owner = await self.account()
        await self.new_budget(owner, "2026-11")
        january = await self.new_budget(owner, "2027-01")
        await self.new_budget(owner, "2027-03")
        report = (await owner.put("/api/forecast", json={
            "starting_balance_cents": 100_000, "from_month": "2027-01",
        })).json()
        self.assertEqual([row["month"] for row in report["months"]], ["2027-01", "2027-03"])
        self.assertEqual(report["forecast_end_balance_cents"], 186_000)
        await owner.delete(f"/api/budgets/{january['id']}")
        self.assertEqual((await owner.get("/api/forecast")).json()["forecast_end_balance_cents"], 143_000)
        empty = (await owner.put("/api/forecast", json={
            "starting_balance_cents": -5_000, "from_month": "2028-01",
        })).json()
        self.assertEqual(empty["months"], [])
        self.assertEqual(empty["forecast_end_balance_cents"], -5_000)

    async def test_other_is_saved_copied_counted_and_preserved_for_older_plan_payloads(self):
        owner = await self.account()
        legacy = await self.new_budget(owner, "2027-01")
        self.assertEqual(legacy["allocations"]["other"], 0)
        path = f"/api/budgets/{legacy['id']}"
        updated = {**plan(), "allocations": {**plan()["allocations"], "other": 2_000}}
        response = await owner.put(path, json=updated)
        self.assertEqual(response.json()["planned_remainder_cents"], 41_000)
        await owner.put(path, json=plan())
        self.assertEqual((await owner.get(path)).json()["allocations"]["other"], 2_000)
        copy = await owner.post("/api/budgets", json={"month": "2027-02", **plan(), "copy_previous": True})
        self.assertEqual(copy.json()["allocations"]["other"], 2_000)
        recorded = await owner.post(path + "/entries", json={
            "id": str(uuid4()), "entry_date": "2027-01-02", "category": "other",
            "description": "Birthday gift", "amount_cents": 3_000,
        })
        self.assertEqual(recorded.status_code, 201, recorded.text)
        self.assertEqual(recorded.json()["spending"]["other"], 3_000)
        self.assertEqual(recorded.json()["remainder_cents"], -3_000)
        invalid = await owner.put(path, json={**plan(), "allocations": {**plan()["allocations"], "other": -1}})
        self.assertEqual(invalid.status_code, 422)
