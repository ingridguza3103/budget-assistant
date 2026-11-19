import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, authenticate, getAccount, logout } from "../src/api";
import { listBudgets } from "../src/budget-api";
import App from "../src/App";

vi.mock("../src/ForecastDashboard", () => ({ default: () => null }));

vi.mock("../src/api", async (original) => ({
  ...await original<typeof import("../src/api")>(),
  authenticate: vi.fn(),
  getAccount: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../src/budget-api", async (original) => ({
  ...await original<typeof import("../src/budget-api")>(),
  listBudgets: vi.fn(async () => []),
}));

const account = { username: "BudgetUser8" };
const getAccountMock = vi.mocked(getAccount);
const authenticateMock = vi.mocked(authenticate);
const logoutMock = vi.mocked(logout);

beforeEach(() => {
  vi.resetAllMocks();
  history.replaceState(null, "", "/");
  getAccountMock.mockResolvedValue(null);
});

afterEach(cleanup);

async function openLogin() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Log in", exact: true });
  return user;
}

test("shows and hides the password before signing in", async () => {
  authenticateMock.mockResolvedValue(account);
  const user = await openLogin();
  await user.type(screen.getByLabelText("Username"), account.username);
  const password = screen.getByLabelText("Password", { exact: true });
  await user.type(password, "Demo8abc");
  expect(password.getAttribute("type")).toBe("password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(password.getAttribute("type")).toBe("text");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(password.getAttribute("type")).toBe("password");

  await user.click(screen.getByRole("button", { name: "Log in", exact: true }));
  expect(authenticateMock).toHaveBeenCalledWith("login", {
    username: account.username,
    password: "Demo8abc",
  });
  expect(await screen.findByRole("heading", { name: "My Budgets" })).toBeTruthy();
});

test("shows the signup hint and lets the user correct a duplicate username", async () => {
  authenticateMock
    .mockRejectedValueOnce(new Error("That username is unavailable."))
    .mockResolvedValueOnce({ username: "BudgetUser82" });
  const user = await openLogin();
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  const username = screen.getByLabelText("Username");
  expect(document.activeElement).toBe(username);
  expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();

  await user.type(username, account.username);
  await user.type(screen.getByLabelText("Password", { exact: true }), "Demo8abc");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  expect((await screen.findByRole("alert")).textContent).toBe("That username is unavailable.");

  await user.type(username, "2");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  expect(authenticateMock).toHaveBeenLastCalledWith("signup", {
    username: "BudgetUser82",
    password: "Demo8abc",
  });
  expect(await screen.findByRole("heading", { name: "My Budgets" })).toBeTruthy();
});

test("loads an existing session and allows logout to be retried", async () => {
  getAccountMock.mockResolvedValue(account);
  logoutMock.mockRejectedValueOnce(new Error("Try again.")).mockResolvedValueOnce(undefined);
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole("heading", { name: "My Budgets" })).toBeTruthy();

  const logoutButton = screen.getByRole("button", { name: "Log out" });
  await user.click(logoutButton);
  expect((await screen.findByRole("alert")).textContent).toBe("Try again.");
  await user.click(logoutButton);
  expect(await screen.findByRole("heading", { name: "Log in", exact: true })).toBeTruthy();
});

test("retries a failed session check", async () => {
  getAccountMock.mockRejectedValueOnce(new Error("Couldn’t reach the app."));
  const user = userEvent.setup();
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toBe("Couldn’t reach the app.");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Log in", exact: true })).toBeTruthy();
  expect(getAccountMock).toHaveBeenCalledTimes(2);
});

test("explains expiry and rechecks month ownership after login", async () => {
  history.replaceState(null, "", "/?month=2026-11&view=calendar");
  getAccountMock.mockResolvedValue(account);
  authenticateMock.mockResolvedValue(account);
  vi.mocked(listBudgets).mockRejectedValueOnce(new ApiError("Log in", 401)).mockResolvedValueOnce([]);
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText("Your session expired. Log in to continue.")).toBeTruthy();
  expect(screen.getByText("Capitalization matters.")).toBeTruthy();
  await user.type(screen.getByLabelText("Username"), account.username);
  await user.type(screen.getByLabelText("Password", { exact: true }), "Demo8abc");
  await user.click(screen.getByRole("button", { name: "Log in", exact: true }));
  expect(await screen.findByText(/This month is unavailable in your account/)).toBeTruthy();
  expect(location.search).toBe("?month=2026-11&view=calendar");
});
