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

function budgetPath(id: number): string {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid budget ID.");
  }
  return "/" + encodeURIComponent(String(id));
}

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function recordIdSegment(id: string): string {
  if (typeof id !== "string" || !uuidPattern.test(id)) {
    throw new Error("Invalid record ID.");
  }
  return encodeURIComponent(id);
}

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

export async function savePlan(id: number, plan: Plan): Promise<Budget> {
  return budgetRequest(budgetPath(id), jsonBody("PUT", plan));
}

export async function readActivity(budgetId: number, signal: AbortSignal): Promise<Activity> {
  return budgetRequest(`${budgetPath(budgetId)}/activity`, { signal });
}

export async function addEntry(budgetId: number, entry: Entry): Promise<Activity> {
  return budgetRequest(`${budgetPath(budgetId)}/entries`, jsonBody("POST", entry));
}

export async function editEntry(budgetId: number, entryId: string, entry: EntryInput): Promise<Activity> {
  return budgetRequest(`${budgetPath(budgetId)}/entries/${recordIdSegment(entryId)}`, jsonBody("PUT", entry));
}

export async function deleteEntry(budgetId: number, entryId: string): Promise<Activity> {
  return budgetRequest(`${budgetPath(budgetId)}/entries/${recordIdSegment(entryId)}`, { method: "DELETE" });
}
