import { type FormEvent, useEffect, useState } from "react";
import { type Budget, createBudget, listBudgets } from "./budget-api";
import { localDay, money, monthName } from "./budget-format";
import PlanEditor from "./PlanEditor";
import { budgetError, useBudgetAction } from "./use-budget-action";
import "./budgets.css";

export default function BudgetWorkspace({ expireSession }: { expireSession: () => void }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const action = useBudgetAction(expireSession);
  const selected = budgets.find((budget) => budget.id === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    listBudgets(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setBudgets(items);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setLoadError(budgetError(failure, expireSession));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [expireSession, loadAttempt]);

  function storeBudget(budget: Budget) {
    setBudgets((items) => [...items.filter((item) => item.id !== budget.id), budget]
      .sort((first, second) => second.month.localeCompare(first.month)));
  }

  function addMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const created = await createBudget(month);
      storeBudget(created);
      setSelectedId(created.id);
    });
  }

  if (selected) {
    return (
      <>
        <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>All budgets</button>
        <h1 className="budget-month-heading">{monthName(selected.month)}</h1>
        <PlanEditor key={selected.id} budget={selected} onSaved={storeBudget} expireSession={expireSession} />
      </>
    );
  }

  return (
    <>
      <h1>My Budgets</h1>
      {loading ? <p className="budget-status" role="status">Loading your budgets…</p> : loadError ? (
        <section className="budget-panel">
          <p className="form-error" role="alert">{loadError}</p>
          <button type="button" className="secondary-button" onClick={() => {
            setLoading(true);
            setLoadError("");
            setLoadAttempt((attempt) => attempt + 1);
          }}>Try again</button>
        </section>
      ) : (
        <>
          <form className="budget-panel budget-fields budget-create" onSubmit={addMonth}>
            <label className="budget-field">Month
              <input type="month" min="1900-01" max="9999-12" value={month} required
                onChange={(event) => setMonth(event.target.value)} />
            </label>
            <button className="primary-button budget-primary" type="submit" disabled={action.pending}>Create month</button>
            {action.error && <p className="form-error" role="alert">{action.error}</p>}
          </form>
          {budgets.length === 0 ? <p className="budget-status">No budgets yet.</p> : (
            <ul className="budget-grid">
              {budgets.map((budget) => (
                <li key={budget.id}>
                  <button type="button" className="budget-card" aria-label={"Open " + monthName(budget.month)}
                    onClick={() => setSelectedId(budget.id)}>
                    <strong>{monthName(budget.month)}</strong>
                    <span>Planned income <b>{money(budget.planned_income_cents)}</b></span>
                    <span>Planned remainder <b>{money(budget.planned_remainder_cents)}</b></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
