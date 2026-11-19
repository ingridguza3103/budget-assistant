import { apiRequest, ensureSuccess } from "./api";

export const categories = ["bills", "everyday", "savings", "debt", "travel", "gifts", "groceries", "other"] as const;
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

export function createBudget(month: string, plan: Plan): Promise<Budget> {
  return budgetRequest("", jsonBody("POST", { month, ...plan }));
}

export async function savePlan(id: number, plan: Plan): Promise<Budget> {
  return budgetRequest(budgetPath(id), jsonBody("PUT", plan));
}

export async function deleteBudget(id: number): Promise<void> {
  await ensureSuccess(await apiRequest("/api/budgets" + budgetPath(id), { method: "DELETE" }));
}

export type SamplePreview = { plan: Plan; activity: Activity; bills: Bill[] };

export function previewSampleMonth(month: string, signal: AbortSignal): Promise<SamplePreview> {
  return budgetRequest("/sample/preview", { ...jsonBody("POST", { month }), signal });
}

export function loadSampleMonth(month: string): Promise<Budget> {
  return budgetRequest("/sample", jsonBody("POST", { month }));
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

export type NewBill = { id: string; due_date: string; name: string; amount_cents: number };
export type BillSeries = { id: string; start_month: string; end_month?: string | null; due_day: number };
export type Bill = NewBill & { paid: boolean; series?: BillSeries | null };

export async function addMonthlyBill(budgetId: number, bill: NewBill, sourceId?: string): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills/monthly`, jsonBody("POST", {
    ...bill, source_bill_id: sourceId,
  }));
}

export async function stopMonthlyBill(budgetId: number, seriesId: string): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills/monthly/${recordIdSegment(seriesId)}/stop`, { method: "POST" });
}

export async function listBills(budgetId: number, signal: AbortSignal): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills`, { signal });
}

export async function addBill(budgetId: number, bill: NewBill): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills`, jsonBody("POST", bill));
}

export async function editBill(budgetId: number, billId: string, fields: Omit<NewBill, "id">): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills/${recordIdSegment(billId)}`, jsonBody("PUT", fields));
}

export async function setBillPaid(budgetId: number, billId: string, paid: boolean): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills/${recordIdSegment(billId)}/status`, jsonBody("PUT", { paid }));
}

export async function deleteBill(budgetId: number, billId: string): Promise<Bill[]> {
  return budgetRequest(`${budgetPath(budgetId)}/bills/${recordIdSegment(billId)}`, { method: "DELETE" });
}


export type ForecastSettings = {
  starting_balance_cents: number;
  from_month: string | null;
  until_month: string | null;
};
export type ForecastMonth = {
  budget_id: number;
  month: string;
  planned_remainder_cents: number;
  recorded_remainder_cents: number;
  use_actuals: boolean;
  planned_balance_cents: number;
  forecast_balance_cents: number;
  actual_balance_cents: number | null;
};
export type Forecast = ForecastSettings & {
  months: ForecastMonth[];
  planned_end_balance_cents: number;
  forecast_end_balance_cents: number;
  actual_balance_cents: number;
  actual_through_month: string | null;
};

async function forecastRequest(init?: RequestInit): Promise<Forecast> {
  const response = await apiRequest("/api/forecast", init);
  await ensureSuccess(response);
  return response.json();
}

export function readForecast(signal: AbortSignal): Promise<Forecast> {
  return forecastRequest({ signal });
}

export function saveForecast(settings: ForecastSettings): Promise<Forecast> {
  return forecastRequest(jsonBody("PUT", settings));
}

export async function setForecastSource(budgetId: number, useActuals: boolean): Promise<Forecast> {
  return budgetRequest(budgetPath(budgetId) + "/forecast", jsonBody("PUT", { use_actuals: useActuals }));
}
