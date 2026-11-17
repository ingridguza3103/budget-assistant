import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import BillCalendar from "../src/BillCalendar";
import { addBill, deleteBill, listBills, setBillPaid } from "../src/budget-api";

vi.mock("../src/budget-api", () => ({
  listBills: vi.fn(), addBill: vi.fn(), setBillPaid: vi.fn(), deleteBill: vi.fn(),
}));

const budget = {
  id: 1, month: "2026-11", planned_income_cents: 0, planned_remainder_cents: 0,
  allocations: { bills: 0, everyday: 0, savings: 0, debt: 0 },
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
  expect(await screen.findByText("€95.43")).toBeTruthy();
  const bill = vi.mocked(addBill).mock.calls[0][1];
  vi.mocked(setBillPaid).mockResolvedValue([{ ...bill, paid: true }]);
  await user.click(screen.getByRole("button", { name: "Mark paid" }));
  expect(await screen.findByText("2026-11-09 · Paid")).toBeTruthy();
  expect(setBillPaid).toHaveBeenCalledWith(1, bill.id, true);
  await user.click(screen.getByRole("button", { name: "Remove bill" }));
  expect(await screen.findByText("No bills scheduled.")).toBeTruthy();
});
