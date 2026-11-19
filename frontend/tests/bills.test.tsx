import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import BillCalendar from "../src/BillCalendar";
import { addBill, addMonthlyBill, stopMonthlyBill, deleteBill, editBill, listBills, setBillPaid } from "../src/budget-api";

vi.mock("../src/budget-api", () => ({
  addMonthlyBill: vi.fn(), stopMonthlyBill: vi.fn(), editBill: vi.fn(), listBills: vi.fn(), addBill: vi.fn(), setBillPaid: vi.fn(), deleteBill: vi.fn(),
}));

const budget = {
  id: 1, month: "2026-11", planned_income_cents: 0, planned_remainder_cents: 0,
  allocations: { bills: 0, everyday: 0, savings: 0, debt: 0, other: 0 },
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("schedules a bill and tracks its paid status", async () => {
  vi.mocked(listBills).mockResolvedValue([]);
  vi.mocked(addBill).mockImplementation(async (_id, bill) => [{ ...bill, paid: false }]);
  vi.mocked(deleteBill).mockResolvedValue([]);
  const user = userEvent.setup();
  render(<BillCalendar budget={budget} expireSession={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Bill name"), { target: { value: "Electricity" } });
  fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-11-09" } });
  fireEvent.change(screen.getByLabelText("Bill amount"), { target: { value: "95,43" } });
  await user.click(screen.getByRole("button", { name: "Add bill" }));
  expect((await screen.findAllByText("€95.43")).length).toBeGreaterThan(0);
  const bill = vi.mocked(addBill).mock.calls[0][1];
  vi.mocked(setBillPaid).mockResolvedValue([{ ...bill, paid: true }]);
  await user.click(screen.getByRole("button", { name: "Mark paid Electricity" }));
  expect(await screen.findByText("9 Nov 2026 · Paid")).toBeTruthy();
  expect(setBillPaid).toHaveBeenCalledWith(1, bill.id, true);
  await user.click(screen.getByRole("button", { name: "Remove Electricity" }));
  expect(deleteBill).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(await screen.findByText("No bills scheduled.")).toBeTruthy();
});

test("filters bills by date and pre-fills the date for a new bill", async () => {
  vi.mocked(listBills).mockResolvedValue([
    { id: "electricity", due_date: "2026-11-09", name: "Electricity", amount_cents: 9543, paid: false },
    { id: "internet", due_date: "2026-11-12", name: "Internet", amount_cents: 3000, paid: true },
  ]);
  const user = userEvent.setup();
  render(<BillCalendar budget={budget} expireSession={vi.fn()} />);

  const dueDate = await screen.findByRole("button", { name: "9 November 2026, 1 due" });
  expect(screen.getByRole("button", { name: "12 November 2026, 1 paid" })).toBeTruthy();
  await user.click(dueDate);
  expect(dueDate.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Electricity")).toBeTruthy();
  expect(screen.queryByText("Internet")).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>("Due date").value).toBe("2026-11-09");

  await user.click(screen.getByRole("button", { name: "10 November 2026" }));
  expect(screen.getByText("No bills scheduled for this date.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "All dates" }));
  expect(screen.getByText("Electricity")).toBeTruthy();
  expect(screen.getByText("Internet")).toBeTruthy();
});

test("edits the selected occurrence and filters paid bills", async () => {
  const bill = { id: "a", name: "Water", due_date: "2026-11-01", amount_cents: 2000, paid: false };
  vi.mocked(listBills).mockResolvedValue([bill]);
  vi.mocked(editBill).mockResolvedValue([{ ...bill, amount_cents: 3000 }]);
  const user = userEvent.setup();
  render(<BillCalendar budget={budget} expireSession={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Edit Water" }));
  fireEvent.change(screen.getByLabelText("Bill amount"), { target: { value: "30" } });
  await user.click(screen.getByRole("button", { name: "Save bill" }));
  expect(editBill).toHaveBeenCalledWith(1, "a", { name: "Water", due_date: "2026-11-01", amount_cents: 3000 });
  await user.selectOptions(screen.getByLabelText("Bill status"), "Paid");
  expect(screen.getByText("No bills match this filter.")).toBeTruthy();
});

test("promotes a one-off bill and requires confirmation before stopping its series", async () => {
  const bill = { id: "one", name: "Gym", due_date: "2026-11-05", amount_cents: 2500, paid: true };
  const series = { id: "series", start_month: "2026-11-01", due_day: 5 };
  vi.mocked(listBills).mockResolvedValue([bill]);
  vi.mocked(addMonthlyBill).mockResolvedValue([{ ...bill, series }]);
  vi.mocked(stopMonthlyBill).mockResolvedValue([{ ...bill, series: { ...series, end_month: "2026-11-01" } }]);
  render(<BillCalendar budget={budget} expireSession={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Gym" }));
  await user.click(screen.getByLabelText("Repeat monthly"));
  await user.click(screen.getByRole("button", { name: "Save bill" }));
  expect(addMonthlyBill).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Gym", due_date: "2026-11-05" }), "one");
  await user.click(screen.getByRole("button", { name: "Stop repeating after this month" }));
  expect(stopMonthlyBill).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm stop" }));
  expect(stopMonthlyBill).toHaveBeenCalledWith(1, "series");
  expect(await screen.findByText(/through November 2026/)).toBeTruthy();
});
