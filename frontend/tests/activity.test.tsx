import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import MonthContent from "../src/MonthContent";
import { type Activity, addEntry, deleteEntry, editEntry, readActivity } from "../src/budget-api";

vi.mock("../src/budget-api", async (original) => ({
  ...await original<typeof import("../src/budget-api")>(),
  readActivity: vi.fn(),
  addEntry: vi.fn(),
  editEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

const budget = {
  id: 1, month: "2026-11", planned_income_cents: 250_000,
  allocations: { bills: 100_000, everyday: 30_000, savings: 20_000, debt: 5_000, other: 0 },
  planned_remainder_cents: 95_000,
};
const empty: Activity = {
  entries: [], income_cents: 250_000, outflow_cents: 0, remainder_cents: 250_000,
  spending: { bills: 0, everyday: 0, savings: 0, debt: 0, other: 0 },
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("adds an entry, flags an overage, edits the amount and deletes the entry", async () => {
  vi.mocked(readActivity).mockResolvedValue(empty);
  vi.mocked(addEntry).mockImplementation(async (_id, entry) => ({
    ...empty, entries: [entry], outflow_cents: entry.amount_cents,
    remainder_cents: empty.income_cents - entry.amount_cents,
    spending: { ...empty.spending, bills: entry.amount_cents },
  }));
  vi.mocked(editEntry).mockImplementation(async (_id, id, entry) => ({
    ...empty, entries: [{ ...entry, id }], outflow_cents: entry.amount_cents,
    remainder_cents: empty.income_cents - entry.amount_cents,
    spending: { ...empty.spending, bills: entry.amount_cents },
  }));
  vi.mocked(deleteEntry).mockResolvedValue(empty);
  const user = userEvent.setup();
  render(<MonthContent budget={budget} expireSession={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Date"), { target: { value: "2026-11-07" } });
  await user.selectOptions(screen.getByLabelText("Category"), "bills");
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1300,00" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Rent" } });
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect(await screen.findByText("€300.00 over budget")).toBeTruthy();
  expect(screen.getByLabelText<HTMLSelectElement>("Category").value).toBe("bills");
  expect(screen.getByLabelText<HTMLInputElement>("Date").value).toBe("2026-11-07");
  expect(screen.getByLabelText<HTMLInputElement>("Amount").value).toBe("");
  await user.type(screen.getByLabelText("Search description"), "other");
  expect(screen.getByText("No transactions match these filters.")).toBeTruthy();
  expect(screen.getByText("€300.00 over budget")).toBeTruthy();
  await user.clear(screen.getByLabelText("Search description"));
  expect(addEntry).toHaveBeenCalledWith(1, {
    id: expect.any(String), entry_date: "2026-11-07", category: "bills", amount_cents: 130_000, description: "Rent",
  });

  await user.click(screen.getByRole("button", { name: "Edit Rent", exact: true }));
  expect(document.activeElement).toBe(screen.getByLabelText("Date"));
  expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("1300.00");
  await user.click(screen.getByRole("button", { name: "Cancel edit" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Rent" }));
  await user.click(screen.getByRole("button", { name: "Edit Rent", exact: true }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "900" } });
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  expect(editEntry).toHaveBeenCalled();
  expect(screen.queryByText("€300.00 over budget")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Delete Rent", exact: true }));
  expect(deleteEntry).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  expect(await screen.findByText("No activity recorded.")).toBeTruthy();
});

test("retries a failed activity load and rejects zero amounts", async () => {
  vi.mocked(readActivity).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(empty);
  const user = userEvent.setup();
  render(<MonthContent budget={budget} expireSession={vi.fn()} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Offline");
  await user.click(screen.getByRole("button", { name: "Retry activity" }));
  fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: "0" } });
  await user.click(screen.getByRole("button", { name: "Add entry" }));
  expect((await screen.findByRole("alert")).textContent).toContain("greater than zero");
  expect(addEntry).not.toHaveBeenCalled();
});
