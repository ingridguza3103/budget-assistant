import { useCallback, useEffect, useRef } from "react";
import Dashboard from "./Dashboard";
import { previewSampleMonth } from "./budget-api";
import { categoryNames, shortDay, money, monthName } from "./budget-format";
import { useBudgetData } from "./use-budget-action";

type Props = {
  month: string; occupied: boolean; expireSession: () => void;
  pending: boolean; error: string; onSave: () => void; onBack: () => void;
};
export default function SampleBudget({ month, occupied, expireSession, pending, error, onSave, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const load = useCallback((signal: AbortSignal) => previewSampleMonth(month, signal), [month]);
  const preview = useBudgetData(load, expireSession);
  return <article>
    <button type="button" className="secondary-button" disabled={pending} onClick={onBack}>All budgets</button>
    <h1 ref={heading} tabIndex={-1} className="budget-month-heading">Sample budget · {monthName(month)}</h1>
    <p className="budget-status">Explore a fictional month. Save a copy to edit its plan, activity and calendar.</p>
    {preview.loading && <p role="status">Loading sample…</p>}
    {preview.error && <p role="alert">{preview.error} <button type="button" onClick={preview.retry}>Try again</button></p>}
    {preview.data && <>
      <Dashboard budget={preview.data.plan} activity={preview.data.activity} />
      <section className="budget-panel"><h2>Sample activity</h2><ul className="budget-entries">
        {preview.data.activity.entries.map(entry => <li key={entry.id}><span>{entry.description || categoryNames[entry.category]}</span>
          <span>{shortDay(entry.entry_date)}</span><b>{entry.category === "income" ? "+" : "−"}{money(entry.amount_cents)}</b></li>)}</ul></section>
      <section className="budget-panel"><h2>Sample calendar</h2><ul className="budget-entries">
        {preview.data.bills.map(bill => <li key={bill.id}><span>{bill.name}</span><span>{shortDay(bill.due_date)}</span>
          <span>{bill.paid ? "Paid" : "Unpaid"}</span><b>{money(bill.amount_cents)}</b></li>)}</ul></section>
      {occupied ? <p className="budget-status">You already have a budget here. Choose an unused month to save a sample.</p> :
        <button type="button" disabled={pending} className="primary-button" onClick={onSave}>
          {pending ? "Saving…" : "Save sample as " + monthName(month)}</button>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}
