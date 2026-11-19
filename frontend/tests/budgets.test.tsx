import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import BudgetWorkspace from "../src/BudgetWorkspace";
import { type Budget, addEntry, deleteBudget, createBudget, listBills, listBudgets, previewSampleMonth, loadSampleMonth, readActivity, savePlan } from "../src/budget-api";
import { ApiError } from "../src/api";

vi.mock("../src/budget-api", async (original) => ({
  ...await original<typeof import("../src/budget-api")>(),
  listBudgets: vi.fn(),
  addEntry: vi.fn(),
  deleteBudget: vi.fn(),
  createBudget: vi.fn(),
  loadSampleMonth: vi.fn(),
  previewSampleMonth: vi.fn(),
  readActivity: vi.fn(),
  listBills: vi.fn(),
  savePlan: vi.fn(),
}));

const november: Budget = {
  id: 1,
  month: "2026-11",
  planned_income_cents: 0,
  allocations: { bills: 0, everyday: 0, savings: 0, debt: 0 },
  planned_remainder_cents: 0,
};

function selectNovember() {
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2026" } });
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: "11" } });
}

test("chooses a year directly and rejects an incomplete year", async () => {
  vi.mocked(listBudgets).mockResolvedValue([]);
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  const year = await screen.findByLabelText("Year");
  fireEvent.change(year, { target: { value: "20" } });
  expect((screen.getByRole("button", { name: "Create my first budget" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(year, { target: { value: "2031" } });
  await userEvent.selectOptions(screen.getByLabelText("Month"), "03");
  expect((screen.getByRole("button", { name: "Create my first budget" }) as HTMLButtonElement).disabled).toBe(false);
  expect(createBudget).not.toHaveBeenCalled();
});

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.mocked(listBills).mockResolvedValue([]);
  vi.mocked(readActivity).mockResolvedValue({
    entries: [], income_cents: 0, outflow_cents: 0, remainder_cents: 0,
    spending: { bills: 0, everyday: 0, savings: 0, debt: 0 },
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("creates a month, saves euro amounts and reopens the saved card", async () => {
  vi.mocked(listBudgets).mockResolvedValue([]);
  vi.mocked(createBudget).mockResolvedValue({
    ...november, planned_income_cents: 250_050, allocations: { ...november.allocations, bills: 100_000 },
    planned_remainder_cents: 150_050,
  });
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  expect(await screen.findByText("No budgets yet.")).toBeTruthy();
  selectNovember();
  await user.click(screen.getByRole("button", { name: "Create my first budget" }));
  expect(createBudget).not.toHaveBeenCalled();

  const income = await screen.findByLabelText("Planned income");
  fireEvent.change(income, { target: { value: "2500,50" } });
  fireEvent.change(screen.getByLabelText("Bills"), { target: { value: "1000" } });
  await user.click(screen.getByRole("button", { name: "Save plan" }));
  await screen.findByRole("region", { name: "Actual activity" });
  expect(createBudget).toHaveBeenCalledWith("2026-11", {
    planned_income_cents: 250_050,
    allocations: { ...november.allocations, bills: 100_000 },
  });

  await user.click(screen.getByRole("button", { name: "All budgets" }));
  const card = screen.getByRole("button", { name: "Open November 2026" });
  expect(within(card).getByText("€1,500.50")).toBeTruthy();
  await user.click(card);
  expect((screen.getByLabelText("Planned income") as HTMLInputElement).value).toBe("2500.50");
});

test("validates amounts before saving", async () => {
  vi.mocked(listBudgets).mockResolvedValue([november]);
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Open November 2026" }));
  fireEvent.change(screen.getByLabelText("Planned income"), { target: { value: "15.004" } });
  await user.click(screen.getByRole("button", { name: "Save plan" }));
  expect((await screen.findByRole("alert")).textContent).toContain("up to two decimal places");
  expect(savePlan).not.toHaveBeenCalled();
});

test("copies the preceding plan into an editable draft and cancels without creating a month", async () => {
  vi.mocked(listBudgets).mockResolvedValue([{ ...november, planned_income_cents: 9000 }]);
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await screen.findByLabelText("Year");
  selectNovember();
  await user.click(screen.getByRole("button", { name: "Open budget for November 2026" }));
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  await user.selectOptions(screen.getByLabelText("Month"), "12");
  await user.click(screen.getByLabelText("Copy November 2026’s plan"));
  await user.click(screen.getByRole("button", { name: "Start a month" }));
  expect((screen.getByLabelText("Planned income") as HTMLInputElement).value).toBe("90.00");
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  expect(createBudget).not.toHaveBeenCalled();
});

test("loads a sample and previews a change without saving", async () => {
  vi.mocked(listBudgets).mockResolvedValue([]);
  vi.mocked(loadSampleMonth).mockResolvedValue({
    ...november,
    planned_income_cents: 200_000,
    allocations: { ...november.allocations, bills: 100_000 },
    planned_remainder_cents: 100_000,
  });
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await screen.findByLabelText("Year");
  selectNovember();
  vi.mocked(previewSampleMonth).mockResolvedValue({ plan: november, bills: [],
    activity: { entries: [], spending: november.allocations, income_cents: 0, outflow_cents: 0, remainder_cents: 0 } });
  await user.click(screen.getByRole("button", { name: "Try a sample budget" }));
  await screen.findByRole("heading", { name: "Sample calendar" });
  expect(loadSampleMonth).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save sample as November 2026" }));
  expect(loadSampleMonth).toHaveBeenCalledWith("2026-11");
  const scenario = within(await screen.findByRole("region", { name: "What if?" }));
  await user.click(scenario.getByRole("button", { name: "Preview a change" }));
  const bills = scenario.getByLabelText("Bills");
  fireEvent.change(bills, { target: { value: "1100" } });
  expect(scenario.getByText("€900.00")).toBeTruthy();
  expect(savePlan).not.toHaveBeenCalled();
  fireEvent.change(bills, { target: { value: "bad" } });
  expect(scenario.getByText("Enter valid amounts to see the preview.")).toBeTruthy();
  await user.click(scenario.getByRole("button", { name: "Discard preview" }));
  expect(scenario.queryByLabelText("Bills")).toBeNull();
  expect((screen.getByLabelText("Bills") as HTMLInputElement).value).toBe("1000.00");
});

test("retries loading budgets and returns an expired session to login", async () => {
  vi.mocked(listBudgets)
    .mockRejectedValueOnce(new Error("Unable to load budgets."))
    .mockRejectedValueOnce(new ApiError("Log in to continue.", 401));
  const expireSession = vi.fn();
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={expireSession} />);
  expect((await screen.findByRole("alert")).textContent).toBe("Unable to load budgets.");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await vi.waitFor(() => expect(expireSession).toHaveBeenCalledOnce());
});

test("requires confirmation to delete a named month", async () => {
  vi.mocked(listBudgets).mockResolvedValue([november]);
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open November 2026" }));
  await user.click(screen.getByRole("button", { name: "Delete month" }));
  await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
  expect(deleteBudget).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete month" }));
  await user.click(screen.getByRole("button", { name: "Delete November 2026" }));
  expect(deleteBudget).toHaveBeenCalledWith(1);
  expect(await screen.findByText("No budgets yet.")).toBeTruthy();
});

test("updates the draft remainder and protects leaving until the user decides", async () => {
  vi.mocked(listBudgets).mockResolvedValue([november]);
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open November 2026" }));
  const plan = within(screen.getByRole("region", { name: "Monthly plan" }));
  fireEvent.change(plan.getByLabelText("Savings"), { target: { value: "10" } });
  expect(plan.getByText("€10.00 overallocated")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(plan.getByText("Unsaved changes")).toBeTruthy();
  await user.click(plan.getByRole("button", { name: "Discard changes" }));
  const scenario = within(screen.getByRole("region", { name: "What if?" }));
  await user.click(scenario.getByRole("button", { name: "Preview a change" }));
  fireEvent.change(scenario.getByLabelText("Savings"), { target: { value: "25" } });
  await user.click(scenario.getByRole("button", { name: "Use this preview" }));
  expect(plan.getByText("€25.00 overallocated")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  await user.click(screen.getByRole("button", { name: "Discard and leave" }));
  expect(savePlan).not.toHaveBeenCalled();
});

test("opens a bookmarked calendar, switches between saved months and survives remount", async () => {
  const budgets = [november, { ...november, id: 2, month: "2025-12" }];
  vi.mocked(listBudgets).mockResolvedValue(budgets);
  history.replaceState(null, "", "/?month=2026-11&view=calendar");
  const user = userEvent.setup();
  const mounted = render(<BudgetWorkspace expireSession={vi.fn()} />);
  await screen.findByRole("heading", { name: "Bill calendar" });
  expect(screen.queryByRole("heading", { name: "Monthly plan" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Previous month" }));
  expect(location.search).toBe("?month=2025-12&view=calendar");
  mounted.unmount();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await screen.findByRole("heading", { name: "December 2025" });
  await user.click(screen.getByRole("button", { name: "Back to budget" }));
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  await user.selectOptions(screen.getByLabelText("Filter by year"), "2025");
  expect(screen.queryByRole("button", { name: "Open November 2026" })).toBeNull();
});

test("moves focus between the saved card and month heading, and titles the view", async () => {
  vi.mocked(listBudgets).mockResolvedValue([november]);
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Open November 2026" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "November 2026" }));
  expect(document.title).toBe("November 2026 · Budget Assistant");
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open November 2026" }));
});

test("browser Back can keep a draft or discard it and restore the original history entry", async () => {
  vi.mocked(listBudgets).mockResolvedValue([november]);
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Open November 2026" }));
  fireEvent.change(screen.getByLabelText("Savings"), { target: { value: "10" } });
  act(() => history.back());
  await user.click(await screen.findByRole("button", { name: "Keep editing" }));
  expect(location.search).toBe("?month=2026-11");
  expect(screen.getByLabelText<HTMLInputElement>("Savings").value).toBe("10");
  act(() => history.back());
  await user.click(await screen.findByRole("button", { name: "Discard and leave" }));
  await screen.findByRole("heading", { name: "My Budgets" });
  expect(location.search).toBe("");
  act(() => history.forward());
  await screen.findByRole("heading", { name: "November 2026" });
  expect(screen.getByLabelText<HTMLInputElement>("Savings").value).toBe("0.00");
});

test("save and leave creates the new draft once and returns to its saved card", async () => {
  vi.mocked(listBudgets).mockResolvedValue([]);
  vi.mocked(createBudget).mockResolvedValue({ ...november, planned_income_cents: 1000, planned_remainder_cents: 1000 });
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await screen.findByLabelText("Year");
  selectNovember();
  await user.click(screen.getByRole("button", { name: "Create my first budget" }));
  fireEvent.change(screen.getByLabelText("Planned income"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "All budgets" }));
  await user.click(screen.getByRole("button", { name: "Save and leave" }));
  expect(await screen.findByRole("heading", { name: "My Budgets" })).toBeTruthy();
  expect(createBudget).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Open November 2026" })).toBeTruthy();
});

test("opens a scheduled payment in Activity and records it only after Add entry", async () => {
  vi.mocked(listBudgets).mockResolvedValue([november]);
  vi.mocked(listBills).mockResolvedValue([{ id: "fc4f21b5-bca5-4574-b72a-aa202552e870",
    due_date: "2026-11-18", name: "Internet service", amount_cents: 4200, paid: false }]);
  vi.mocked(addEntry).mockImplementation(async (_, entry) => ({
    entries: [entry], income_cents: 0, outflow_cents: 4200, remainder_cents: -4200,
    spending: { ...november.allocations, bills: 4200 },
  }));
  history.replaceState(null, "", "/?month=2026-11&view=calendar");
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Record payment" }));
  const form = within(await screen.findByRole("region", { name: "Actual activity" }));
  expect((form.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-11-18");
  expect((form.getByLabelText("Amount") as HTMLInputElement).value).toBe("42.00");
  expect((form.getByLabelText("Category") as HTMLSelectElement).value).toBe("bills");
  expect((form.getByLabelText("Description") as HTMLInputElement).value).toBe("Internet service");
  expect(document.activeElement).toBe(form.getByRole("heading", { name: "Actual activity" }));
  expect(addEntry).not.toHaveBeenCalled();
  await user.click(form.getByRole("button", { name: "Add entry" }));
  expect(await form.findByText("−€42.00")).toBeTruthy();
  expect(addEntry).toHaveBeenCalledOnce();
});
