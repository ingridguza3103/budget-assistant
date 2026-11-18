import { useState } from "react";
import { type Budget, deleteBudget } from "./budget-api";
import { monthName } from "./budget-format";
import { useBudgetAction } from "./use-budget-action";

export default function MonthDeletion({ budget, expireSession, onDeleted }: {
  budget: Budget; expireSession: () => void; onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const action = useBudgetAction(expireSession);
  const name = monthName(budget.month);
  return <section className="month-deletion" aria-label="Delete month">
    {confirming ? <>
      <p>Delete {name} and all its transactions and scheduled bills? This is permanent.</p>
      <button type="button" className="secondary-button" autoFocus disabled={action.pending}
        onClick={() => setConfirming(false)}>Cancel deletion</button>
      <button type="button" className="secondary-button danger" disabled={action.pending}
        onClick={() => void action.run(async () => { await deleteBudget(budget.id); onDeleted(); })}>
        {action.pending ? "Deleting…" : "Delete " + name}
      </button>
    </> : <button type="button" className="secondary-button danger" onClick={() => setConfirming(true)}>Delete month</button>}
    {action.error && <p className="form-error" role="alert">{action.error}</p>}
  </section>;
}
