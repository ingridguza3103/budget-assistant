import { type FormEvent, useState } from "react";
import ActivityPanel from "./ActivityPanel";
import { type Budget, createBudget, listBudgets } from "./budget-api";
import { localDay, money, monthName } from "./budget-format";
import PlanEditor from "./PlanEditor";
import { useBudgetAction, useBudgetData } from "./use-budget-action";
import "./budgets.css";

export default function BudgetWorkspace({ expireSession }: { expireSession: () => void }) {
  const load = useBudgetData(listBudgets, expireSession);
  const budgets = load.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [copyPrevious, setCopyPrevious] = useState(false);
  const action = useBudgetAction(expireSession);
  const selected = budgets.find((budget) => budget.id === selectedId);

  function storeBudget(budget: Budget) {
    load.setData((items) => [...(items ?? []).filter((item) => item.id !== budget.id), budget]
      .sort((first, second) => second.month.localeCompare(first.month)));
  }

  function addMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const created = await createBudget(month, copyPrevious);
      storeBudget(created);
      setSelectedId(created.id);
      setCopyPrevious(false);
    });
  }

  if (selected) {
    return (
      <article key={selected.id}>
        <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>All budgets</button>
        <h1 className="budget-month-heading">{monthName(selected.month)}</h1>
        <PlanEditor budget={selected} onSaved={storeBudget} expireSession={expireSession} />
        <ActivityPanel budget={selected} expireSession={expireSession} />
      </article>
    );
  }

  return (
    <>
      <h1>My Budgets</h1>
      {load.loading ? <p className="budget-status" role="status">Loading your budgets…</p> : load.error ? (
        <section className="budget-panel">
          <p className="form-error" role="alert">{load.error}</p>
          <button type="button" className="secondary-button" onClick={load.retry}>Try again</button>
        </section>
      ) : (
        <>
          <form className="budget-panel budget-fields budget-create" onSubmit={addMonth}>
            <label className="budget-field">Month
              <input type="month" min="1900-01" max="9999-12" value={month} required
                onChange={(event) => setMonth(event.target.value)} />
            </label>
            <label className="budget-check">
              <input type="checkbox" checked={copyPrevious} onChange={(event) => setCopyPrevious(event.target.checked)} />
              Copy last month’s plan
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
