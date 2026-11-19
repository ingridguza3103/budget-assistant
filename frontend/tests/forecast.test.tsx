import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ForecastDashboard from "../src/ForecastDashboard";
import { type Budget, type Forecast, readForecast, saveForecast, setForecastSource } from "../src/budget-api";
import { ApiError } from "../src/api";
import { parseStartingBalance } from "../src/budget-format";

vi.mock("../src/budget-api", async original => ({
  ...await original<typeof import("../src/budget-api")>(),
  readForecast: vi.fn(), saveForecast: vi.fn(), setForecastSource: vi.fn(),
}));

const budget: Budget = {
  id: 1, month: "2027-01", planned_income_cents: 100000, planned_remainder_cents: 50000,
  allocations: { bills: 40000, everyday: 0, savings: 0, debt: 0, other: 10000, travel: 0, gifts: 0, groceries: 0 },
};
const report: Forecast = {
  starting_balance_cents: 100000, from_month: null, until_month: null,
  planned_end_balance_cents: 210000, forecast_end_balance_cents: 210000,
  actual_balance_cents: 100000, actual_through_month: null,
  months: [
    { budget_id: 1, month: "2027-01", planned_remainder_cents: 50000, recorded_remainder_cents: 40000,
      use_actuals: false, planned_balance_cents: 150000, forecast_balance_cents: 150000, actual_balance_cents: null },
    { budget_id: 2, month: "2027-02", planned_remainder_cents: 60000, recorded_remainder_cents: 0,
      use_actuals: false, planned_balance_cents: 210000, forecast_balance_cents: 210000, actual_balance_cents: null },
  ],
};
const budgets = [budget, { ...budget, id: 2, month: "2027-02" }];

beforeEach(() => {
  vi.mocked(readForecast).mockResolvedValue(report);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("shows saved-month plans before activity is complete and opens a month", async () => {
  const onOpen = vi.fn();
  render(<ForecastDashboard budgets={budgets} expireSession={vi.fn()} onOpen={onOpen} />);
  await screen.findByText("Forecast at end");
  expect(screen.getByText("Forecast at end").parentElement?.textContent).toContain("€2,100.00");
  const row = screen.getByRole("row", { name: /January 2027/ });
  expect(within(row).getByText("€400.00")).toBeTruthy();
  expect(within(row).getByText("—")).toBeTruthy();
  expect((screen.getByLabelText("Use actuals for January 2027") as HTMLInputElement).checked).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "January 2027" }));
  expect(onOpen).toHaveBeenCalledWith("2027-01");
});

test("saves a negative starting balance and the selected first month", async () => {
  vi.mocked(saveForecast).mockImplementation(async settings => ({
    ...report, ...settings, planned_end_balance_cents: 9950, forecast_end_balance_cents: 9950,
    actual_balance_cents: settings.starting_balance_cents,
  }));
  const user = userEvent.setup();
  render(<ForecastDashboard budgets={budgets} expireSession={vi.fn()} onOpen={vi.fn()} />);
  const field = await screen.findByLabelText("Starting balance (€)");
  await user.clear(field);
  await user.type(field, "-1000,50");
  await user.selectOptions(screen.getByLabelText("Forecast from"), "2027-01");
  await user.click(screen.getByRole("button", { name: "Save forecast settings" }));
  expect(saveForecast).toHaveBeenCalledWith({ starting_balance_cents: -100050, from_month: "2027-01", until_month: null });
  expect(await screen.findByText("Forecast settings saved.")).toBeTruthy();
  expect((field as HTMLInputElement).value).toBe("-1000.50");
  expect(screen.getByText("Forecast at end").parentElement?.textContent).toContain("€99.50");
});

test("switches a completed month to actuals and can restore its plan", async () => {
  vi.mocked(setForecastSource).mockResolvedValueOnce({
    ...report, forecast_end_balance_cents: 200000, actual_balance_cents: 140000, actual_through_month: "2027-01",
    months: [{ ...report.months[0], use_actuals: true, forecast_balance_cents: 140000, actual_balance_cents: 140000 },
      { ...report.months[1], forecast_balance_cents: 200000 }],
  }).mockResolvedValueOnce(report);
  const user = userEvent.setup();
  render(<ForecastDashboard budgets={budgets} expireSession={vi.fn()} onOpen={vi.fn()} />);
  const source = await screen.findByLabelText("Use actuals for January 2027");
  await user.click(source);
  expect(setForecastSource).toHaveBeenCalledWith(1, true);
  expect(await screen.findByText("Using recorded activity.")).toBeTruthy();
  expect(screen.getByText("Forecast at end").parentElement?.textContent).toContain("€2,000.00");
  expect(screen.getByText("Plan at end").parentElement?.textContent).toContain("€2,100.00");
  await user.click(source);
  expect(setForecastSource).toHaveBeenLastCalledWith(1, false);
  expect(await screen.findByText("Using the saved plan.")).toBeTruthy();
});

test("keeps invalid and failed settings drafts available for correction", async () => {
  vi.mocked(saveForecast).mockRejectedValue(new Error("Unable to save the starting balance."));
  render(<ForecastDashboard budgets={budgets} expireSession={vi.fn()} onOpen={vi.fn()} />);
  const field = await screen.findByLabelText("Starting balance (€)");
  fireEvent.change(field, { target: { value: "12.345" } });
  await userEvent.click(screen.getByRole("button", { name: "Save forecast settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain("two decimal places");
  expect(saveForecast).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "-50" } });
  await userEvent.click(screen.getByRole("button", { name: "Save forecast settings" }));
  expect(await screen.findByText("Unable to save the starting balance.")).toBeTruthy();
  expect((field as HTMLInputElement).value).toBe("-50");
});

test("shows a loading state, retries a failed read and expires an unauthorized source change", async () => {
  vi.mocked(readForecast).mockRejectedValueOnce(new Error("Forecast unavailable.")).mockResolvedValueOnce(report);
  vi.mocked(setForecastSource).mockRejectedValue(new ApiError("Session expired.", 401));
  const expireSession = vi.fn();
  render(<ForecastDashboard budgets={budgets} expireSession={expireSession} onOpen={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("Loading");
  await screen.findByText("Forecast unavailable.");
  await userEvent.click(screen.getByRole("button", { name: "Retry forecast" }));
  await userEvent.click(await screen.findByLabelText("Use actuals for January 2027"));
  await vi.waitFor(() => expect(expireSession).toHaveBeenCalledOnce());
});

test("supports saving before any budgets exist and keeps both persisted limits selectable", async () => {
  vi.mocked(readForecast).mockResolvedValue({ ...report, from_month: "2028-01", until_month: "2028-12", months: [],
    starting_balance_cents: -5000, planned_end_balance_cents: -5000,
    forecast_end_balance_cents: -5000, actual_balance_cents: -5000 });
  render(<ForecastDashboard budgets={[]} expireSession={vi.fn()} onOpen={vi.fn()} />);
  expect(await screen.findByText("Create a budget in this range to build your forecast.")).toBeTruthy();
  expect((screen.getByLabelText("Forecast from") as HTMLSelectElement).value).toBe("2028-01");
  expect((screen.getByLabelText("Forecast until") as HTMLSelectElement).value).toBe("2028-12");
  expect((screen.getByLabelText("Starting balance (€)") as HTMLInputElement).value).toBe("-50.00");
});

test.each([["-1000,50", -100050], [" 1000.50 ", 100050], ["0", 0], ["-0", 0]])(
  "reads a signed starting balance (%s)", (text, expected) => {
    expect(parseStartingBalance(text)).toBeCloseTo(expected);
  },
);

test("saves an inclusive upper limit and can reopen the forecast end", async () => {
  vi.mocked(saveForecast).mockImplementation(async settings => ({
    ...report, ...settings,
    months: settings.until_month ? report.months.slice(0, 1) : report.months,
    planned_end_balance_cents: settings.until_month ? 150000 : 210000,
    forecast_end_balance_cents: settings.until_month ? 150000 : 210000,
  }));
  const user = userEvent.setup();
  render(<ForecastDashboard budgets={budgets} expireSession={vi.fn()} onOpen={vi.fn()} />);
  const until = await screen.findByLabelText("Forecast until");
  await user.selectOptions(until, "2027-01");
  await user.click(screen.getByRole("button", { name: "Save forecast settings" }));
  expect(saveForecast).toHaveBeenCalledWith({ starting_balance_cents: 100000, from_month: null, until_month: "2027-01" });
  await screen.findByText("Forecast settings saved.");
  expect(screen.getByText("Forecast at end").parentElement?.textContent).toContain("€1,500.00");
  expect(screen.queryByRole("button", { name: "February 2027" })).toBeNull();
  await user.selectOptions(until, "");
  await user.click(screen.getByRole("button", { name: "Save forecast settings" }));
  await screen.findByRole("button", { name: "February 2027" });
  expect(saveForecast).toHaveBeenLastCalledWith({ starting_balance_cents: 100000, from_month: null, until_month: null });
});

test("rejects a reversed forecast range before saving and lets the user correct it", async () => {
  const user = userEvent.setup();
  render(<ForecastDashboard budgets={budgets} expireSession={vi.fn()} onOpen={vi.fn()} />);
  await user.selectOptions(await screen.findByLabelText("Forecast from"), "2027-02");
  await user.selectOptions(screen.getByLabelText("Forecast until"), "2027-01");
  await user.click(screen.getByRole("button", { name: "Save forecast settings" }));
  expect(screen.getByRole("alert").textContent).toContain("same month as or later");
  expect(saveForecast).not.toHaveBeenCalled();
  vi.mocked(saveForecast).mockResolvedValue({ ...report, from_month: "2027-02", until_month: "2027-02" });
  await user.selectOptions(screen.getByLabelText("Forecast until"), "2027-02");
  await user.click(screen.getByRole("button", { name: "Save forecast settings" }));
  await screen.findByText("Forecast settings saved.");
  expect(saveForecast).toHaveBeenCalledWith({ starting_balance_cents: 100000, from_month: "2027-02", until_month: "2027-02" });
});
