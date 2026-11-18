import { type FormEvent, useCallback, useRef, useState } from "react";
import "./bill-calendar.css";
import { addBill, type Bill, type Budget, deleteBill, editBill, listBills, setBillPaid } from "./budget-api";
import { amountInput, daysInMonth, firstEntryDay, lastDay, localDay, money, parseCents, shortDay } from "./budget-format";
import { useBudgetAction, useBudgetData } from "./use-budget-action";

const calendarDay = new Intl.DateTimeFormat("en-IE", { dateStyle: "long", timeZone: "UTC" });

function formatCalendarDay(date: string): string {
  return calendarDay.format(new Date(date + "T00:00:00Z"));
}

type CalendarGridProps = {
  month: string;
  bills: Bill[];
  selectedDate: string | null;
  disabled: boolean;
  onSelect: (date: string) => void;
};

function CalendarGrid({ month, bills, selectedDate, disabled, onSelect }: CalendarGridProps) {
  const today = localDay();
  const leading = (new Date(month + "-01T00:00:00Z").getUTCDay() + 6) % 7;
  const countsByDate = new Map<string, { paid: number; due: number }>();
  for (const bill of bills) {
    const counts = countsByDate.get(bill.due_date) ?? { paid: 0, due: 0 };
    if (bill.paid) counts.paid += 1;
    else counts.due += 1;
    countsByDate.set(bill.due_date, counts);
  }
  return (
    <div className="bill-calendar" role="group" aria-label="Filter bills by due date">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <strong key={day} aria-hidden="true">{day}</strong>)}
      {Array.from({ length: leading }, (_, index) => <span key={"blank-" + index} />)}
      {Array.from({ length: daysInMonth(month) }, (_, index) => {
        const day = index + 1;
        const date = month + "-" + String(day).padStart(2, "0");
        const counts = countsByDate.get(date);
        const label = [formatCalendarDay(date)];
        if (counts?.due) label.push(counts.due + " due");
        if (counts?.paid) label.push(counts.paid + " paid");
        return (
          <button type="button" key={date}
            className={counts?.due ? "bill-day bill-day-due" : "bill-day"}
            aria-current={today === date ? "date" : undefined} aria-label={label.join(", ")} aria-pressed={selectedDate === date}
            disabled={disabled} onClick={() => onSelect(date)}>
            {day}{today === date && <small>Today</small>}{counts && <small>{counts.due ? counts.due + " due" : counts.paid + " paid"}</small>}
          </button>
        );
      })}
    </div>
  );
}

function billStatus(bill: Bill, today: string): string {
  if (bill.paid) return "Paid";
  if (bill.due_date < today) return "Overdue";
  return bill.due_date === today ? "Due today" : "Upcoming";
}

type Filter = "All" | "Unpaid" | "Overdue" | "Paid";

export default function BillCalendar({ budget, expireSession, onRecord }: {
  budget: Budget; expireSession: () => void; onRecord?: (bill: Bill) => void;
}) {
  const load = useCallback((signal: AbortSignal) => listBills(budget.id, signal), [budget.id]);
  const { data: bills, setData, loading, error, retry } = useBudgetData(load, expireSession);
  const action = useBudgetAction(expireSession);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [editing, setEditing] = useState<Bill | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [dueDate, setDueDate] = useState(() => firstEntryDay(budget.month));
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const pendingId = useRef<string | null>(null);
  const today = localDay();
  const unpaid = (bills ?? []).filter(bill => !bill.paid);
  const sum = (items: Bill[]) => items.reduce((total, bill) => total + bill.amount_cents, 0);
  const next = unpaid.find(bill => bill.due_date >= today);
  const visible = (bills ?? []).filter(bill => (!selectedDate || bill.due_date === selectedDate)
    && (filter === "All" || (filter === "Unpaid" ? !bill.paid : billStatus(bill, today) === filter)));

  function updateDueDate(value: string) { pendingId.current = null; setDueDate(value); }
  function edit(bill: Bill | null) {
    setEditing(bill);
    setName(bill?.name ?? "");
    setAmount(bill ? amountInput(bill.amount_cents) : "");
    updateDueDate(bill?.due_date ?? selectedDate ?? firstEntryDay(budget.month));
    setNotice("");
    nameInput.current?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTarget(null);
    setNotice("");
    void action.run(async () => {
      const fields = { name: name.trim(), due_date: dueDate, amount_cents: parseCents(amount) };
      if (!fields.name || fields.amount_cents <= 0) throw new Error("Enter a name and a positive amount.");
      if (editing) setData(await editBill(budget.id, editing.id, fields));
      else {
        pendingId.current ??= crypto.randomUUID();
        setData(await addBill(budget.id, { ...fields, id: pendingId.current }));
      }
      if (selectedDate) setSelectedDate(dueDate);
      setNotice(editing ? "Bill updated." : "Bill scheduled.");
      setEditing(null); setName(""); setAmount(""); pendingId.current = null;
    });
  }
  function rowAction(id: string, operation: () => Promise<Bill[]>, message: string) {
    setTarget(id); setNotice("");
    void action.run(async () => {
      const result = await operation();
      setData(result); setConfirmId(null);
      if (editing?.id === id && !result.some(bill => bill.id === id)) edit(null);
      setNotice(message);
    });
  }

  return <section className="budget-panel" aria-labelledby="bills-heading">
    <h2 id="bills-heading">Bill calendar</h2>
    {loading && <p role="status">Loading bills…</p>}
    {error && <p role="alert">{error} <button onClick={retry}>Retry bills</button></p>}
    {bills && <>
      <dl className="budget-totals">
        <div><dt>Unpaid total</dt><dd>{money(sum(unpaid))}</dd></div>
        <div><dt>Overdue total</dt><dd>{money(sum(unpaid.filter(bill => bill.due_date < today)))}</dd></div>
        <div><dt>Next bill due</dt><dd>{next ? shortDay(next.due_date) + " · " + next.name : "None scheduled"}</dd></div>
      </dl>
      <CalendarGrid month={budget.month} bills={bills} selectedDate={selectedDate} disabled={action.pending}
        onSelect={date => { setSelectedDate(date); if (!editing) updateDueDate(date); }} />
      <div className="budget-row bill-list-heading">
        <h3>{selectedDate ? "Bills for " + formatCalendarDay(selectedDate) : "Scheduled bills"}</h3>
        <div className="budget-actions">
          <label>Bill status <select value={filter} onChange={e => setFilter(e.target.value as Filter)}>
            {["All", "Unpaid", "Overdue", "Paid"].map(value => <option key={value}>{value}</option>)}</select></label>
          <button type="button" className="secondary-button" aria-pressed={!selectedDate}
            onClick={() => setSelectedDate(null)}>All dates</button>
        </div>
      </div>
      <p className="budget-status">Mark paid updates the calendar. Record a payment in Activity to include it in your actual spending.</p>
      {visible.length ? <ul className="budget-entries">{visible.map(bill => <li key={bill.id}>
        <div><strong>{bill.name}</strong><small>{shortDay(bill.due_date)} · {billStatus(bill, today)}</small></div>
        <b>{money(bill.amount_cents)}</b>
        <div className="budget-actions">
          <button type="button" className="secondary-button" disabled={action.pending} aria-label={"Edit " + bill.name}
            onClick={() => edit(bill)}>Edit</button>
          <button type="button" className="secondary-button" disabled={action.pending}
            aria-label={(bill.paid ? "Mark unpaid " : "Mark paid ") + bill.name}
            onClick={() => rowAction(bill.id, () => setBillPaid(budget.id, bill.id, !bill.paid), bill.name + (bill.paid ? " marked unpaid." : " marked paid."))}>
            {bill.paid ? "Mark unpaid" : "Mark paid"}</button>
          {onRecord && <button type="button" className="secondary-button" onClick={() => onRecord(bill)}>Record payment</button>}
          <button type="button" className="secondary-button danger" disabled={action.pending} aria-label={"Remove " + bill.name}
            onClick={() => setConfirmId(bill.id)}>Remove bill</button>
        </div>
        {confirmId === bill.id && <div className="row-feedback">Remove {bill.name} from this month?
          <button type="button" disabled={action.pending} onClick={() => setConfirmId(null)}>Cancel</button>
          <button type="button" disabled={action.pending} onClick={() =>
            rowAction(bill.id, () => deleteBill(budget.id, bill.id), bill.name + " removed.")}>Confirm removal</button></div>}
        {target === bill.id && action.error && <p role="alert" className="form-error">{action.error}</p>}
        {target === bill.id && notice && <p role="status">{notice}</p>}
      </li>)}</ul> : <p className="budget-status">{filter !== "All" ? "No bills match this filter." :
        selectedDate ? "No bills scheduled for this date." : "No bills scheduled."}</p>}
      {target && notice && !visible.some(bill => bill.id === target) && <p role="status">{notice}</p>}
      <form onSubmit={submit}>
        <fieldset className="budget-fields" disabled={action.pending}>
          <legend>{editing ? "Editing " + editing.name : "Schedule a bill"}</legend>
          <label className="budget-field">Bill name<input ref={nameInput} required maxLength={80} value={name}
            onChange={e => { pendingId.current = null; setName(e.target.value); }} /></label>
          <label className="budget-field">Due date<input type="date" required min={budget.month + "-01"} max={lastDay(budget.month)}
            value={dueDate} onChange={e => updateDueDate(e.target.value)} /></label>
          <label className="budget-field">Bill amount<input inputMode="decimal" required maxLength={9} value={amount}
            onChange={e => { pendingId.current = null; setAmount(e.target.value); }} /></label>
        </fieldset>
        <div className="budget-actions"><button type="submit" className="primary-button budget-primary" disabled={action.pending}>
          {action.pending && !target ? "Saving…" : editing ? "Save bill" : "Add bill"}</button>
          {editing && <button type="button" className="secondary-button" onClick={() => edit(null)}>Cancel edit</button>}
        </div>
        {!target && action.error && <p role="alert" className="form-error">{action.error}</p>}
        {!target && notice && <p role="status">{notice}</p>}
      </form>
    </>}
  </section>;
}
