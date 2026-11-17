import { type FormEvent, useCallback, useRef, useState } from "react";
import { addBill, type Bill, type Budget, deleteBill, listBills, setBillPaid } from "./budget-api";
import { daysInMonth, firstEntryDay, lastDay, localDay, money, parseCents } from "./budget-format";
import { useBudgetAction, useBudgetData } from "./use-budget-action";

function CalendarGrid({ month, bills }: { month: string; bills: Bill[] }) {
  const leading = (new Date(month + "-01T00:00:00Z").getUTCDay() + 6) % 7;
  const dueByDay = new Map<number, number>();
  for (const bill of bills) {
    if (!bill.paid) {
      const day = Number(bill.due_date.slice(-2));
      dueByDay.set(day, (dueByDay.get(day) ?? 0) + 1);
    }
  }
  return (
    <div className="bill-calendar" aria-hidden="true">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <strong key={day}>{day}</strong>)}
      {Array.from({ length: leading }, (_, index) => <span key={"blank-" + index} />)}
      {Array.from({ length: daysInMonth(month) }, (_, index) => {
        const day = index + 1;
        const due = dueByDay.get(day);
        return <div className={due ? "bill-day bill-day-due" : "bill-day"} key={day}>
          {day}{due && <small>{due} due</small>}
        </div>;
      })}
    </div>
  );
}

function billStatus(bill: Bill, today: string): string {
  if (bill.paid) return "Paid";
  if (bill.due_date < today) return "Overdue";
  return bill.due_date === today ? "Due today" : "Upcoming";
}

export default function BillCalendar({ budget, expireSession }: { budget: Budget; expireSession: () => void }) {
  const load = useCallback((signal: AbortSignal) => listBills(budget.id, signal), [budget.id]);
  const { data: bills, setData, loading, error, retry } = useBudgetData(load, expireSession);
  const action = useBudgetAction(expireSession);
  const [dueDate, setDueDate] = useState(() => firstEntryDay(budget.month));
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const pendingId = useRef<string | null>(null);
  const today = localDay();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.run(async () => {
      const cents = parseCents(amount);
      if (cents === 0 || !name.trim()) throw new Error("Enter a bill name and an amount greater than zero.");
      pendingId.current ??= crypto.randomUUID();
      setData(await addBill(budget.id, {
        id: pendingId.current, due_date: dueDate, name: name.trim(), amount_cents: cents,
      }));
      pendingId.current = null;
      setName("");
      setAmount("");
    });
  }

  return (
    <section className="budget-panel" aria-labelledby="bills-heading">
      <h2 id="bills-heading">Bill calendar</h2>
      {loading && <p className="budget-status" role="status">Loading bills…</p>}
      {error && <>
        <p className="form-error" role="alert">{error}</p>
        <button type="button" className="secondary-button" onClick={retry}>Retry bills</button>
      </>}
      {bills && <>
        <CalendarGrid month={budget.month} bills={bills} />
        <form onSubmit={submit}>
          <fieldset className="budget-fields" aria-label="Schedule a bill" disabled={action.pending}>
            <label className="budget-field">Bill name
              <input type="text" required maxLength={80} value={name}
                onChange={(event) => { pendingId.current = null; setName(event.target.value); }} />
            </label>
            <label className="budget-field">Due date
              <input type="date" required min={budget.month + "-01"} max={lastDay(budget.month)} value={dueDate}
                onChange={(event) => { pendingId.current = null; setDueDate(event.target.value); }} />
            </label>
            <label className="budget-field">Bill amount
              <input type="text" inputMode="decimal" required maxLength={9} value={amount}
                onChange={(event) => { pendingId.current = null; setAmount(event.target.value); }} />
            </label>
          </fieldset>
          <button type="submit" className="primary-button budget-primary" disabled={action.pending}>Add bill</button>
        </form>
        {action.error && <p className="form-error" role="alert">{action.error}</p>}
        {bills.length ? <ul className="budget-entries">
          {bills.map((bill) => <li key={bill.id}>
            <div><strong>{bill.name}</strong><small>{bill.due_date} · {billStatus(bill, today)}</small></div>
            <b>{money(bill.amount_cents)}</b>
            <div className="budget-actions">
              <button type="button" className="secondary-button" disabled={action.pending}
                onClick={() => void action.run(async () => setData(await setBillPaid(budget.id, bill.id, !bill.paid)))}>
                {bill.paid ? "Mark unpaid" : "Mark paid"}
              </button>
              <button type="button" className="secondary-button" disabled={action.pending}
                onClick={() => void action.run(async () => setData(await deleteBill(budget.id, bill.id)))}>
                Remove bill
              </button>
            </div>
          </li>)}
        </ul> : <p className="budget-status">No bills scheduled.</p>}
      </>}
    </section>
  );
}
