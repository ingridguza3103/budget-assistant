import { type FormEvent, useState } from "react";
import { type Budget, categories, type Category, type Plan, savePlan } from "./budget-api";
import { amountInput, categoryNames, money, parseCents } from "./budget-format";
import { useBudgetAction } from "./use-budget-action";

type PlanField = "income" | Category;
type PlanDraft = Record<PlanField, string>;

function planDraft(plan: Plan): PlanDraft {
  return {
    income: amountInput(plan.planned_income_cents),
    bills: amountInput(plan.allocations.bills),
    everyday: amountInput(plan.allocations.everyday),
    savings: amountInput(plan.allocations.savings),
    debt: amountInput(plan.allocations.debt),
  };
}

function parsePlan(draft: PlanDraft): Plan {
  return {
    planned_income_cents: parseCents(draft.income),
    allocations: {
      bills: parseCents(draft.bills),
      everyday: parseCents(draft.everyday),
      savings: parseCents(draft.savings),
      debt: parseCents(draft.debt),
    },
  };
}

type PlanFieldsProps = {
  draft: PlanDraft;
  onChange: (draft: PlanDraft) => void;
};

function PlanFields({ draft, onChange }: PlanFieldsProps) {
  const fields: readonly PlanField[] = ["income", ...categories];
  return fields.map((field) => (
    <label key={field} className="budget-field">
      {field === "income" ? "Planned income" : categoryNames[field]}
      <input
        type="text"
        inputMode="decimal"
        value={draft[field]}
        required
        maxLength={9}
        onChange={(event) => onChange({ ...draft, [field]: event.target.value })}
      />
    </label>
  ));
}

type Props = {
  budget: Budget;
  onSaved: (changed: Budget) => void;
  expireSession: () => void;
};

export default function PlanEditor({ budget, onSaved, expireSession }: Props) {
  const [draft, setDraft] = useState(() => planDraft(budget));
  const [saved, setSaved] = useState(false);
  const action = useBudgetAction(expireSession);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    void action.run(async () => {
      const updated = await savePlan(budget.id, parsePlan(draft));
      onSaved(updated);
      setDraft(planDraft(updated));
      setSaved(true);
    });
  }

  return (
    <section className="budget-panel" aria-labelledby="plan-heading">
      <div className="budget-row">
        <h2 id="plan-heading">Monthly plan</h2>
        <span className="budget-balance">
          Planned remainder <strong>{money(budget.planned_remainder_cents)}</strong>
        </span>
      </div>
      <form onSubmit={submit}>
        <fieldset className="budget-fields" aria-label="Plan amounts in euros" disabled={action.pending}>
          <PlanFields draft={draft} onChange={(changed) => {
            setDraft(changed);
            setSaved(false);
          }} />
        </fieldset>
        <button className="primary-button budget-primary" type="submit" disabled={action.pending}>Save plan</button>
        {action.error && <p className="form-error" role="alert">{action.error}</p>}
        {saved && <p className="budget-status" role="status">Plan saved.</p>}
      </form>
    </section>
  );
}
