import { type FormEvent, useState } from "react";
import { ApiError } from "./api";
import MonthContent from "./MonthContent";
import SampleBudget from "./SampleBudget";
import MonthDeletion from "./MonthDeletion";
import MonthPicker, { validMonth } from "./MonthPicker";
import BillCalendar from "./BillCalendar";
import { type Budget, type Plan, savePlan, createBudget, listBudgets, loadSampleMonth } from "./budget-api";
import { localDay, money, monthName } from "./budget-format";
import PlanEditor, { ScenarioPanel } from "./PlanEditor";
import { useBudgetAction, useBudgetData } from "./use-budget-action";
import "./budgets.css";

const emptyPlan: Plan = { planned_income_cents: 0, allocations: { bills: 0, everyday: 0, savings: 0, debt: 0 } };

function precedingMonth(month: string) {
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export default function BudgetWorkspace({ expireSession }: { expireSession: () => void }) {
  const load = useBudgetData(listBudgets, expireSession);
  const budgets = load.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [copyPrevious, setCopyPrevious] = useState(false);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<{ month: string; plan: Plan } | null>(null);
  const existing = budgets.find(item => item.month === month);
  const sourceMonth = validMonth(month) ? precedingMonth(month) : "";
  const previous = budgets.find(item => item.month === sourceMonth);
  const action = useBudgetAction(expireSession);
  const selected = budgets.find((budget) => budget.id === selectedId);

  function storeBudget(budget: Budget) {
    load.setData((items) => [...(items ?? []).filter((item) => item.id !== budget.id), budget]
      .sort((first, second) => second.month.localeCompare(first.month)));
  }

  function addMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validMonth(month)) return;
    if (existing) setSelectedId(existing.id);
    else setDraft({ month, plan: copyPrevious && previous ? previous : emptyPlan });
  }

  async function saveNewMonth(plan: Plan) {
    try {
      return await createBudget(month, plan);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) load.retry();
      throw error;
    }
  }

  function addSample() {
    void action.run(async () => {
      const created = await loadSampleMonth(month);
      setPreview(false);
      storeBudget(created);
      setSelectedId(created.id);
      setCopyPrevious(false);
    });
  }

  if (preview) return <SampleBudget month={month} occupied={!!existing} expireSession={expireSession}
    pending={action.pending} error={action.error} onSave={addSample} onBack={() => setPreview(false)} />;

  if (draft) return <article>
    <button className="secondary-button" type="button" onClick={() => setDraft(null)}>All budgets</button>
    <h1 className="budget-month-heading">{monthName(draft.month)}</h1>
    <p className="budget-status">Save your plan to start recording activity and bills.</p>
    <PlanEditor budget={draft.plan} expireSession={expireSession} persist={saveNewMonth} onSaved={created => {
      storeBudget(created);
      setSelectedId(created.id);
      setDraft(null);
      setCopyPrevious(false);
    }} />
    {existing && <button type="button" className="secondary-button" onClick={() => {
      setDraft(null);
      setSelectedId(existing.id);
    }}>Open the saved budget</button>}
  </article>;

  if (selected) {
    return (
      <article key={selected.id}>
        <button className="secondary-button" type="button" onClick={() => setSelectedId(null)}>All budgets</button>
        <h1 className="budget-month-heading">{monthName(selected.month)}</h1>
        <MonthContent budget={selected} expireSession={expireSession}>
          <PlanEditor budget={selected} persist={plan => savePlan(selected.id, plan)} onSaved={storeBudget} expireSession={expireSession} />
        </MonthContent>
        <ScenarioPanel budget={selected} />
        <BillCalendar budget={selected} expireSession={expireSession} />
        <MonthDeletion key={selected.id} budget={selected} expireSession={expireSession} onDeleted={() => {
          load.setData(items => (items ?? []).filter(item => item.id !== selected.id));
          setSelectedId(null);
        }} />
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
            <MonthPicker value={month} onChange={value => { setMonth(value); setCopyPrevious(false); }} />
            <label className="budget-check">
              <input type="checkbox" disabled={!previous || !!existing} checked={!!previous && !existing && copyPrevious} onChange={(event) => setCopyPrevious(event.target.checked)} />
              {previous ? "Copy " + monthName(previous.month) + "’s plan" : "Copy previous plan"}
            </label>
              <button className="primary-button budget-primary" type="submit" disabled={action.pending || !validMonth(month)}>
                {existing ? "Open budget for " + monthName(month) : (budgets.length ? "Start a month" : "Create my first budget")}
              </button>

            {!previous && sourceMonth && !existing && <small className="copy-hint">No plan saved for {monthName(sourceMonth)}.</small>}
            {action.error && <p className="form-error" role="alert">{action.error}</p>}
          </form>
          <button className="secondary-button sample-action" type="button" disabled={!validMonth(month)}
            onClick={() => setPreview(true)}>Try a sample budget</button>
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
