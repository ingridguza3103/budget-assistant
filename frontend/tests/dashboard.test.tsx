import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import Dashboard from "../src/Dashboard";
const plan = { planned_income_cents: 10000, allocations: { bills: 5000, everyday: 0, savings: 2000, debt: 0, other: 0, travel: 0, gifts: 0, groceries: 0 } };
afterEach(cleanup);
test("keeps missing activity distinct from a zero balance", () => {
  render(<Dashboard budget={plan} activity={null} loading />);
  expect(screen.getByText("Loading…")).toBeTruthy();
  expect(screen.getByText("€30.00")).toBeTruthy();
});
test("distinguishes unplanned spending, an exceeded goal and a zero target", () => {
  render(<Dashboard budget={plan} activity={{ entries: [], spending: { bills: 5500, everyday: 1000, savings: 2500, debt: 0, other: 0, travel: 0, gifts: 0, groceries: 0 },
    income_cents: 9000, outflow_cents: 9000, remainder_cents: 0 }} />);
  expect(within(screen.getByRole("table", { name: "Bills progress" })).getByText("110%")).toBeTruthy();
  for (const value of ["€5.00 above target", "€5.00 over budget", "Unplanned spending", "€10.00 below expected"]) {
    expect(screen.getByText(value)).toBeTruthy();
  }
  const other = screen.getByRole("table", { name: "Other progress" }).closest("article")!;
  expect(within(other).getByText("No plan yet")).toBeTruthy();
});
