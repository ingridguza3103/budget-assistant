import { apiRequest, ensureSuccess } from "./api";

export const categories = ["bills", "everyday", "savings", "debt"] as const;
export type Category = (typeof categories)[number];
export type Plan = {
  planned_income_cents: number;
  allocations: Record<Category, number>;
};
export type Budget = Plan & {
  id: number;
  month: string;
  planned_remainder_cents: number;
};
export const entryCategories = ["income", ...categories] as const;
export type EntryCategory = (typeof entryCategories)[number];
export type EntryInput = {
  entry_date: string;
  category: EntryCategory;
  description: string;
  amount_cents: number;
};
export type Entry = EntryInput & { id: string };
export type Activity = {
  entries: Entry[];
  income_cents: number;
  outflow_cents: number;
  remainder_cents: number;
  spending: Record<Category, number>;
};

async function budgetRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest("/api/budgets" + path, init);
  await ensureSuccess(response);
  return response.json();
}

function jsonBody(method: "POST" | "PUT", data: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export function listBudgets(signal: AbortSignal): Promise<Budget[]> {
  return budgetRequest("", { signal });
}

export function createBudget(month: string, copyPrevious: boolean): Promise<Budget> {
  return budgetRequest("", jsonBody("POST", {
    month,
    copy_previous: copyPrevious,
    planned_income_cents: 0,
    allocations: { bills: 0, everyday: 0, savings: 0, debt: 0 },
  }));
}

export function savePlan(id: number, plan: Plan): Promise<Budget> {
  return budgetRequest("/" + id, jsonBody("PUT", plan));
}

export function readActivity(budgetId: number, signal: AbortSignal): Promise<Activity> {
  return budgetRequest(`/${budgetId}/activity`, { signal });
}

export function addEntry(budgetId: number, entry: Entry): Promise<Activity> {
  return budgetRequest(`/${budgetId}/entries`, jsonBody("POST", entry));
}

export function editEntry(budgetId: number, entryId: string, entry: EntryInput): Promise<Activity> {
  return budgetRequest(`/${budgetId}/entries/${entryId}`, jsonBody("PUT", entry));
}

export function deleteEntry(budgetId: number, entryId: string): Promise<Activity> {
  return budgetRequest(`/${budgetId}/entries/${entryId}`, { method: "DELETE" });
}
