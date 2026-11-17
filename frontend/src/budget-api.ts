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
