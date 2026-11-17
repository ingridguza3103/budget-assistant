import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import BudgetWorkspace from "../src/BudgetWorkspace";
import { type Budget, createBudget, listBills, listBudgets, loadSampleMonth, readActivity, savePlan } from "../src/budget-api";
import { ApiError } from "../src/api";

vi.mock("../src/budget-api", async (original) => ({
  ...await original<typeof import("../src/budget-api")>(),
  listBudgets: vi.fn(),
  createBudget: vi.fn(),
  loadSampleMonth: vi.fn(),
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

beforeEach(() => {
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
  vi.mocked(createBudget).mockResolvedValue(november);
  vi.mocked(savePlan).mockResolvedValue({
    ...november,
    planned_income_cents: 250_050,
    allocations: { ...november.allocations, bills: 100_000 },
    planned_remainder_cents: 150_050,
  });
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  expect(await screen.findByText("No budgets yet.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-11" } });
  await user.click(screen.getByRole("button", { name: "Create month" }));
  expect(vi.mocked(createBudget)).toHaveBeenCalledWith("2026-11", false);

  const income = await screen.findByLabelText("Planned income");
  fireEvent.change(income, { target: { value: "2500,50" } });
  fireEvent.change(screen.getByLabelText("Bills"), { target: { value: "1000" } });
  await user.click(screen.getByRole("button", { name: "Save plan" }));
  expect(await screen.findByText("Plan saved.")).toBeTruthy();
  expect(vi.mocked(savePlan)).toHaveBeenCalledWith(1, {
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

test("requests last month’s plan and shows a missing-plan error", async () => {
  vi.mocked(listBudgets).mockResolvedValue([]);
  vi.mocked(createBudget).mockRejectedValue(new Error("You have no budget for the previous month."));
  const user = userEvent.setup();
  render(<BudgetWorkspace expireSession={vi.fn()} />);
  const month = await screen.findByLabelText("Month");
  fireEvent.change(month, { target: { value: "2026-11" } });
  await user.click(screen.getByRole("checkbox", { name: "Copy last month’s plan" }));
  await user.click(screen.getByRole("button", { name: "Create month" }));
  expect(createBudget).toHaveBeenCalledWith("2026-11", true);
  expect((await screen.findByRole("alert")).textContent).toBe("You have no budget for the previous month.");
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
  fireEvent.change(await screen.findByLabelText("Month"), { target: { value: "2026-11" } });
  await user.click(screen.getByRole("button", { name: "Load sample month" }));
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
