import type { Category } from "./budget-api";

export const categoryNames: Record<Category, string> = {
  bills: "Bills",
  everyday: "Everyday expenses",
  savings: "Savings",
  debt: "Debt payments",
};

const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const months = new Intl.DateTimeFormat("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });

export function money(cents: number): string {
  return euros.format(cents / 100);
}

export function amountInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parseCents(text: string): number {
  const amount = text.trim().match(/^(\d{1,6})(?:[.,](\d{1,2}))?$/);
  if (!amount) throw new Error("Enter amounts from 0 to 999999.99 with up to two decimal places.");
  return Number(amount[1]) * 100 + Number((amount[2] ?? "").padEnd(2, "0"));
}

export function monthName(month: string): string {
  return months.format(new Date(month + "-01T00:00:00Z"));
}

export function localDay(day = new Date()): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return [day.getFullYear(), month, date].join("-");
}
