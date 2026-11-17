import { type FormEvent, useCallback, useRef, useState } from "react";
import {
  addEntry, type Activity, type Budget, categories, deleteEntry, editEntry,
  type Entry, entryCategories, type EntryInput, readActivity,
} from "./budget-api";
import { amountInput, categoryNames, firstEntryDay, lastDay, money, parseCents } from "./budget-format";
import { useBudgetAction, useBudgetData } from "./use-budget-action";

function Comparison({ budget, activity }: { budget: Budget; activity: Activity }) {
  return (
    <>
      <dl className="budget-totals">
        <div><dt>Income received</dt><dd>{money(activity.income_cents)}</dd></div>
        <div><dt>Recorded outflow</dt><dd>{money(activity.outflow_cents)}</dd></div>
        <div><dt>Actual remainder</dt><dd>{money(activity.remainder_cents)}</dd></div>
      </dl>
      <div className="budget-table-wrap">
        <table className="budget-table">
          <caption>Planned vs. actual</caption>
          <thead><tr><th scope="col">Category</th><th scope="col">Planned</th><th scope="col">Actual</th></tr></thead>
          <tbody>
            <tr><th scope="row">Income</th><td>{money(budget.planned_income_cents)}</td><td>{money(activity.income_cents)}</td></tr>
            {categories.map((category) => (
              <tr key={category}>
                <th scope="row">{categoryNames[category]}</th>
                <td>{money(budget.allocations[category])}</td>
                <td>
                  {money(activity.spending[category])}
                  {activity.spending[category] > budget.allocations[category] && <span className="budget-over">Over budget</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type EntryFields = Omit<EntryInput, "amount_cents"> & { amount: string };

function initialFields(month: string, entry: Entry | null): EntryFields {
  return entry ? {
    entry_date: entry.entry_date, category: entry.category, description: entry.description,
    amount: amountInput(entry.amount_cents),
  } : {
    entry_date: firstEntryDay(month), category: "everyday", description: "", amount: "",
  };
}

export default function ActivityPanel({ budget, expireSession }: { budget: Budget; expireSession: () => void }) {
  const load = useCallback((signal: AbortSignal) => readActivity(budget.id, signal), [budget.id]);
  const { data: activity, setData: setActivity, loading, error, retry } = useBudgetData(load, expireSession);
  const action = useBudgetAction(expireSession);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [fields, setFields] = useState(() => initialFields(budget.month, null));
  const pendingId = useRef<string | null>(null);

  function change(next: Partial<EntryFields>) {
    pendingId.current = null;
    setFields((current) => ({ ...current, ...next }));
  }

  function selectEntry(entry: Entry | null) {
    pendingId.current = null;
    setEditing(entry);
    setFields(initialFields(budget.month, entry));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const { amount, ...draft } = fields;
      const amount_cents = parseCents(amount);
      if (!amount_cents) throw new Error("Enter an amount greater than zero.");
      const input = { ...draft, amount_cents };
      if (editing) {
        setActivity(await editEntry(budget.id, editing.id, input));
      } else {
        pendingId.current ??= crypto.randomUUID();
        setActivity(await addEntry(budget.id, { ...input, id: pendingId.current }));
      }
      selectEntry(null);
    });
  }

  async function remove(entry: Entry) {
    setActivity(await deleteEntry(budget.id, entry.id));
    if (editing?.id === entry.id) selectEntry(null);
  }

  return (
    <section className="budget-panel" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Actual activity</h2>
      {loading && <p className="budget-status" role="status">Loading activity…</p>}
      {error && <div>
        <p className="form-error" role="alert">{error}</p>
        <button className="secondary-button" type="button" onClick={retry}>Retry activity</button>
      </div>}
      {activity && <>
        <Comparison budget={budget} activity={activity} />
        <form onSubmit={save}>
          <fieldset className="budget-fields" aria-label={editing ? "Edit activity entry" : "New activity entry"}
            disabled={action.pending}>
            <label className="budget-field">Date
              <input type="date" required min={budget.month + "-01"} max={lastDay(budget.month)}
                value={fields.entry_date} onChange={(event) => change({ entry_date: event.target.value })} />
            </label>
            <label className="budget-field">Category
              <select value={fields.category} onChange={(event) => change({ category: event.target.value as EntryInput["category"] })}>
                {entryCategories.map((category) => <option value={category} key={category}>{categoryNames[category]}</option>)}
              </select>
            </label>
            <label className="budget-field">Amount
              <input type="text" inputMode="decimal" value={fields.amount} required maxLength={9}
                onChange={(event) => change({ amount: event.target.value })} />
            </label>
            <label className="budget-field">Description
              <input type="text" value={fields.description} maxLength={140}
                onChange={(event) => change({ description: event.target.value })} />
            </label>
          </fieldset>
          <div className="budget-actions">
            <button type="submit" className="primary-button budget-primary" disabled={action.pending}>
              {editing ? "Save entry" : "Add entry"}
            </button>
            {editing && <button type="button" className="secondary-button" disabled={action.pending}
              onClick={() => selectEntry(null)}>Cancel edit</button>}
          </div>
          {action.error && <p className="form-error" role="alert">{action.error}</p>}
        </form>
        {activity.entries.length ? (
          <ul className="budget-entries">
            {activity.entries.map((entry) => (
              <li key={entry.id}>
                <div><strong>{entry.description || categoryNames[entry.category]}</strong>
                  <small>{entry.entry_date} · {categoryNames[entry.category]}</small></div>
                <b>{money(entry.amount_cents)}</b>
                <div className="budget-actions">
                  <button type="button" className="secondary-button" disabled={action.pending}
                    onClick={() => selectEntry(entry)}>Edit</button>
                  <button type="button" className="secondary-button" disabled={action.pending}
                    onClick={() => void action.run(() => remove(entry))}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="budget-status">No activity recorded.</p>}
      </>}
    </section>
  );
}
