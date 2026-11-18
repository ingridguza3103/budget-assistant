import { type FormEvent, type RefObject, useEffect, useState } from "react";
import { ApiError } from "./api";
import BillCalendar from "./BillCalendar";
import { type Budget, createBudget, listBudgets, loadSampleMonth, type Plan, savePlan } from "./budget-api";
import { localDay, money, monthName } from "./budget-format";
import "./budgets.css";
import MonthContent from "./MonthContent";
import MonthDeletion from "./MonthDeletion";
import MonthPicker, { validMonth } from "./MonthPicker";
import PlanEditor from "./PlanEditor";
import SampleBudget from "./SampleBudget";
import { useBudgetAction, useBudgetData } from "./use-budget-action";
import useBudgetRoute from "./use-budget-route";
import usePlanLeave from "./use-plan-leave";

const emptyPlan: Plan = { planned_income_cents: 0, allocations: { bills: 0, everyday: 0, savings: 0, debt: 0 } };

function precedingMonth(month: string) {
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export default function BudgetWorkspace({ expireSession, onLeave }: {
  expireSession: () => void; onLeave?: RefObject<((action: () => void) => void) | null>;
}) {
  const { guard, leave, prompt } = usePlanLeave();
  useEffect(() => {
    if (onLeave) onLeave.current = leave;
    return () => { if (onLeave) onLeave.current = null; };
  });
  const load = useBudgetData(listBudgets, expireSession);
  const budgets = load.data ?? [];
  const [yearFilter, setYearFilter] = useState("");
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [copyPrevious, setCopyPrevious] = useState(false);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<{ month: string; plan: Plan } | null>(null);
  const { route, navigate } = useBudgetRoute(guard, leave, () => { setDraft(null); setPreview(false); });
  const years = [...new Set(budgets.map(item => item.month.slice(0, 4)))].sort((first, second) => second.localeCompare(first));
  const visibleBudgets = years.includes(yearFilter) ? budgets.filter(item => item.month.startsWith(yearFilter)) : budgets;
  const existing = budgets.find(item => item.month === month);
  const sourceMonth = validMonth(month) ? precedingMonth(month) : "";
  const previous = budgets.find(item => item.month === sourceMonth);
  const action = useBudgetAction(expireSession);
  const selected = budgets.find((budget) => budget.month === route.month);

  function storeBudget(budget: Budget) {
    load.setData((items) => [...(items ?? []).filter((item) => item.id !== budget.id), budget]
      .sort((first, second) => second.month.localeCompare(first.month)));
  }

  function addMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validMonth(month)) return;
    if (existing) navigate(existing.month);
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
      navigate(created.month);
      setCopyPrevious(false);
    });
  }

  if (preview) return <SampleBudget month={month} occupied={!!existing} expireSession={expireSession}
    pending={action.pending} error={action.error} onSave={addSample} onBack={() => setPreview(false)} />;

  if (draft) return <article>{prompt}
    <button className="secondary-button" type="button" onClick={() => leave(() => setDraft(null))}>All budgets</button>
    <h1 className="budget-month-heading">{monthName(draft.month)}</h1>
    <p className="budget-status">Save your plan to start recording activity and bills.</p>
    <PlanEditor budget={draft.plan} guard={guard} isNew expireSession={expireSession} persist={saveNewMonth} onSaved={created => {
      storeBudget(created);
      navigate(created.month);
      setDraft(null);
      setCopyPrevious(false);
    }} />
    {existing && <button type="button" className="secondary-button" onClick={() => {
      setDraft(null);
      navigate(existing.month);
    }}>Open the saved budget</button>}
  </article>;

  if (selected) {
    const index = budgets.findIndex(item => item.id === selected.id);
    const previousBudget = budgets[index + 1];
    const nextBudget = budgets[index - 1];
    const go = (target: Budget) => leave(() => navigate(target.month, route.calendar));
    return (
      <article key={selected.id}>{prompt}
        <div className="budget-row">
          <button className="secondary-button" type="button" onClick={() => leave(() => navigate(""))}>All budgets</button>
          <div className="budget-actions">
            <button type="button" className="secondary-button" disabled={!previousBudget}
              onClick={() => go(previousBudget)}>Previous month</button>
            <button type="button" className="secondary-button" disabled={!nextBudget}
              onClick={() => go(nextBudget)}>Next month</button>
          </div>
        </div>
        <h1 className="budget-month-heading">{monthName(selected.month)}</h1>
        <nav className="month-shortcuts" aria-label="Month sections">
          {route.calendar ? <button className="secondary-button" onClick={() => navigate(selected.month)}>Back to budget</button> : <>
            {[["Plan", "plan-heading"], ["Activity", "activity-heading"], ["What if?", "scenario-heading"]].map(([label, id]) =>
              <a key={id} href={"#" + id} onClick={event => {
                event.preventDefault();
                const section = document.getElementById(id);
                section?.scrollIntoView?.({ block: "start" });
                section?.focus();
              }}>{label}</a>)}
            <button type="button" className="secondary-button" onClick={() => leave(() => navigate(selected.month, true))}>Calendar</button>
          </>}
        </nav>
        {route.calendar ? <BillCalendar budget={selected} expireSession={expireSession} /> : <>
        <MonthContent budget={selected} expireSession={expireSession}>
          <PlanEditor guard={guard} budget={selected} persist={plan => savePlan(selected.id, plan)} onSaved={storeBudget} expireSession={expireSession} />
        </MonthContent>
        <MonthDeletion key={selected.id} budget={selected} expireSession={expireSession} onDeleted={() => {
          load.setData(items => (items ?? []).filter(item => item.id !== selected.id));
          navigate("");
        }} />
        </>}
      </article>
    );
  }

  return (
    <>
      <h1>My Budgets</h1>
      {route.month && !load.loading && !load.error && !selected && <p role="status" className="budget-status">
        This month is unavailable in your account. <button className="secondary-button" onClick={() => navigate("", false, true)}>Show all budgets</button>
      </p>}
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
          {years.length > 1 && <label className="year-filter">Filter by year
            <select value={years.includes(yearFilter) ? yearFilter : ""} onChange={event => setYearFilter(event.target.value)}>
              <option value="">All years</option>{years.map(year => <option key={year}>{year}</option>)}
            </select></label>}
          {budgets.length === 0 ? <p className="budget-status">No budgets yet.</p> : (
            <ul className="budget-grid">
              {visibleBudgets.map((budget) => (
                <li key={budget.id}>
                  <button type="button" className="budget-card" aria-label={"Open " + monthName(budget.month)}
                    onClick={() => navigate(budget.month)}>
                    <strong>{monthName(budget.month)}</strong>
                    {budget.month === localDay().slice(0, 7) && <small>Current month</small>}
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
