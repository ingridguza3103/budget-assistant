import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  addEntry, type Activity, type Bill, type Budget, deleteEntry, editEntry,
  type Entry, entryCategories, type EntryCategory, type EntryInput,
} from "./budget-api";
import { amountInput, categoryNames, firstEntryDay, lastDay, money, parseCents, shortDay } from "./budget-format";
import { useBudgetAction } from "./use-budget-action";

type EntryFields = Omit<EntryInput, "amount_cents"> & { amount: string };
const entryName = (entry: Entry) => entry.description || categoryNames[entry.category];

function fieldsFor(month: string, payment?: Bill): EntryFields {
  return payment ? {
    entry_date: payment.due_date, category: "bills", description: payment.name, amount: amountInput(payment.amount_cents),
  } : { entry_date: firstEntryDay(month), category: "everyday", description: "", amount: "" };
}

export default function ActivityPanel({ budget, expireSession, activity, setActivity, payment }: {
  budget: Budget; expireSession: () => void; activity: Activity; payment?: Bill; setActivity: (activity: Activity) => void;
}) {
  const action = useBudgetAction(expireSession);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [fields, setFields] = useState(() => fieldsFor(budget.month, payment));
  const [filter, setFilter] = useState<EntryCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const dateInput = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const editedRow = useRef<HTMLButtonElement | null>(null);
  const activityHeading = useRef<HTMLHeadingElement>(null);
  const pendingId = useRef<string | null>(null);

  useEffect(() => {
    if (payment) activityHeading.current?.focus();
  }, [payment]);
  const needle = search.trim().toLowerCase();
  const visible = activity.entries.filter(entry => (filter === "all" || entry.category === filter)
    && entry.description.toLowerCase().includes(needle));

  useEffect(() => {
    if (!editing && !action.pending && editedRow.current) {
      const target = editedRow.current.isConnected ? editedRow.current : listHeading.current;
      target?.focus();
      editedRow.current = null;
    }
  }, [editing, action.pending]);

  function change(next: Partial<EntryFields>) {
    pendingId.current = null;
    setNotice("");
    setFields(current => ({ ...current, ...next }));
  }
  function beginEdit(entry: Entry, button: HTMLButtonElement) {
    editedRow.current = button;
    setEditing(entry);
    change({ entry_date: entry.entry_date, category: entry.category,
      description: entry.description, amount: amountInput(entry.amount_cents) });
    setConfirm(null);
    dateInput.current?.focus();
    dateInput.current?.scrollIntoView?.({ block: "center" });
  }
  function resetEditor() {
    setEditing(null); pendingId.current = null;
    setFields(fieldsFor(budget.month));
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTarget(null); setNotice("");
    void action.run(async () => {
      const { amount, ...draft } = fields;
      const amount_cents = parseCents(amount);
      if (!amount_cents) throw new Error("Enter an amount greater than zero.");
      const input = { ...draft, amount_cents };
      if (editing) {
        setActivity(await editEntry(budget.id, editing.id, input));
        setTarget(editing.id); setNotice("Entry updated."); resetEditor();
      } else {
        pendingId.current ??= crypto.randomUUID();
        setActivity(await addEntry(budget.id, { ...input, id: pendingId.current }));
        pendingId.current = null;
        setFields(current => ({ ...current, amount: "", description: "" }));
        setNotice("Entry added.");
      }
    });
  }
  function remove(entry: Entry) {
    setTarget(entry.id); setNotice("");
    void action.run(async () => {
      setActivity(await deleteEntry(budget.id, entry.id));
      if (editing?.id === entry.id) resetEditor();
      setConfirm(null);
      setNotice(entryName(entry) + " deleted.");
      listHeading.current?.focus();
    });
  }
  return <section className="budget-panel" aria-labelledby="activity-heading">
    <h2 ref={activityHeading} id="activity-heading" tabIndex={-1}>Actual activity</h2>
    <form onSubmit={save}>
      <fieldset className="budget-fields" disabled={action.pending}>
        <legend>{editing ? "Editing entry · " + entryName(editing) : "New activity entry"}</legend>
        <label className="budget-field">Date
          <input ref={dateInput} type="date" required min={budget.month + "-01"} max={lastDay(budget.month)}
            value={fields.entry_date} onChange={event => change({ entry_date: event.target.value })} />
        </label>
        <label className="budget-field">Category
          <select value={fields.category} onChange={event => change({ category: event.target.value as EntryCategory })}>
            {entryCategories.map(key => <option value={key} key={key}>{categoryNames[key]}</option>)}
          </select>
        </label>
        <label className="budget-field">Amount
          <input inputMode="decimal" value={fields.amount} required maxLength={9} onChange={e => change({ amount: e.target.value })} />
        </label>
        <label className="budget-field">Description
          <input value={fields.description} maxLength={140} onChange={e => change({ description: e.target.value })} />
        </label>
      </fieldset>
      <div className="budget-actions">
        <button type="submit" className="primary-button budget-primary" disabled={action.pending}>
          {action.pending && !target ? "Saving…" : editing ? "Save entry" : "Add entry"}</button>
        {editing && <button type="button" className="secondary-button" disabled={action.pending} onClick={resetEditor}>Cancel edit</button>}
      </div>
      {!target && action.error && <p className="form-error" role="alert">{action.error}</p>}
      {!target && notice && <p role="status">{notice}</p>}
    </form>
    <h3 ref={listHeading} tabIndex={-1}>Transactions</h3>
    <div className="budget-fields activity-filters">
      <label className="budget-field">Filter by category
        <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
          <option value="all">All categories</option>
          {entryCategories.map(key => <option value={key} key={key}>{categoryNames[key]}</option>)}
        </select>
      </label>
      <label className="budget-field">Search description<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
    </div>
    {visible.length ? <ul className="budget-entries">{visible.map(entry => <li key={entry.id}>
      <div><strong>{entryName(entry)}</strong><small>{shortDay(entry.entry_date)} · {categoryNames[entry.category]}</small></div>
      <b>{entry.category === "income" ? "+" : "−"}{money(entry.amount_cents)}</b>
      <div className="budget-actions">
        <button type="button" className="secondary-button" disabled={action.pending} aria-label={"Edit " + entryName(entry)}
          onClick={event => beginEdit(entry, event.currentTarget)}>Edit</button>
        <button type="button" className="secondary-button danger" disabled={action.pending} aria-label={"Delete " + entryName(entry)}
          onClick={() => setConfirm(entry.id)}>Delete</button>
      </div>
      {confirm === entry.id && <div className="row-feedback">Delete {entryName(entry)} on {shortDay(entry.entry_date)}?
        <button type="button" disabled={action.pending} onClick={() => setConfirm(null)}>Keep entry</button>
        <button type="button" disabled={action.pending} onClick={() => remove(entry)}>Confirm deletion</button></div>}
      {target === entry.id && action.error && <p role="alert" className="form-error">{action.error}</p>}
      {target === entry.id && notice && <p role="status">{notice}</p>}
    </li>)}</ul> : <p className="budget-status">{activity.entries.length ? "No transactions match these filters." : "No activity recorded."}</p>}
    {target && notice && !visible.some(entry => entry.id === target) && <p role="status">{notice}</p>}
  </section>;
}
