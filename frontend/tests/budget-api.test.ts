import { afterEach, expect, test, vi } from "vitest";
import { addMonthlyBill, createBudget, deleteBudget, deleteEntry, editBill, loadSampleMonth, previewSampleMonth, readActivity, stopMonthlyBill } from "../src/budget-api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const request = vi.fn(async () => Response.json({ entries: [] }));
  vi.stubGlobal("fetch", request);
  return request;
}

test("uses the current origin and sends integer and UUID route segments", async () => {
  const request = stubFetch();
  const { signal } = new AbortController();
  const entryId = "12345678-1234-4abc-8abc-1234567890ab";
  const origin = window.location.origin;
  await readActivity(42, signal);
  await deleteEntry(42, entryId);
  expect(request).toHaveBeenNthCalledWith(1, origin + "/api/budgets/42/activity",
    expect.objectContaining({ signal, mode: "same-origin", redirect: "error" }));
  expect(request).toHaveBeenNthCalledWith(2, origin + "/api/budgets/42/entries/" + entryId,
    expect.objectContaining({ method: "DELETE", mode: "same-origin", redirect: "error" }));
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "42" as unknown as number])(
  "rejects invalid budget IDs before making a request (%s)", async (id) => {
    const request = stubFetch();
    await expect(readActivity(id, new AbortController().signal)).rejects.toThrow("Invalid budget ID.");
    expect(request).not.toHaveBeenCalled();
  },
);

test("rejects a non-UUID record ID before making a request", async () => {
  const request = stubFetch();
  await expect(deleteEntry(42, "invalid-id")).rejects.toThrow("Invalid record ID.");
  expect(request).not.toHaveBeenCalled();
});

test("submits the edited draft and uses separate preview, save, edit and repeat requests", async () => {
  const request = stubFetch();
  const base = window.location.origin + "/api/budgets";
  const plan = { planned_income_cents: 1000, allocations: { bills: 200, everyday: 0, savings: 0, debt: 0, other: 0, travel: 0, gifts: 0, groceries: 0 } };
  const id = "00112233-4455-6677-8899-aabbccddeeff";
  const fields = { name: "Rent", due_date: "2032-01-31", amount_cents: 200 };
  await createBudget("2032-01", plan);
  await previewSampleMonth("2032-02", new AbortController().signal);
  await loadSampleMonth("2032-02");
  await editBill(42, id, fields);
  await addMonthlyBill(42, { ...fields, id }, id);
  await stopMonthlyBill(42, id);
  await deleteBudget(42);
  expect(request).toHaveBeenNthCalledWith(1, base, expect.objectContaining({
    method: "POST", body: JSON.stringify({ month: "2032-01", ...plan }),
  }));
  for (const [index, path, method] of [
    [2, "/sample/preview", "POST"], [3, "/sample", "POST"], [4, "/42/bills/" + id, "PUT"],
    [5, "/42/bills/monthly", "POST"], [6, "/42/bills/monthly/" + id + "/stop", "POST"], [7, "/42", "DELETE"],
  ] as const) expect(request).toHaveBeenNthCalledWith(index, base + path, expect.objectContaining({ method }));
});


test("loads and saves signed forecast settings and validates monthly forecast IDs", async () => {
  const { readForecast, saveForecast, setForecastSource } = await import("../src/budget-api");
  const request = stubFetch();
  const { signal } = new AbortController();
  const settings = { starting_balance_cents: -100050, from_month: "2027-01", until_month: "2027-12" };
  await readForecast(signal);
  await saveForecast(settings);
  await setForecastSource(42, true);
  expect(request).toHaveBeenNthCalledWith(1, window.location.origin + "/api/forecast",
    expect.objectContaining({ signal, mode: "same-origin" }));
  expect(request).toHaveBeenNthCalledWith(2, window.location.origin + "/api/forecast",
    expect.objectContaining({ method: "PUT", body: JSON.stringify(settings) }));
  expect(request).toHaveBeenNthCalledWith(3, window.location.origin + "/api/budgets/42/forecast",
    expect.objectContaining({ method: "PUT", body: JSON.stringify({ use_actuals: true }) }));
  request.mockClear();
  await expect(setForecastSource(0, true)).rejects.toThrow("Invalid budget ID.");
  expect(request).not.toHaveBeenCalled();
});
