import { useEffect, useId, useState, type RefObject } from "react";
import { type Budget, categories, type Category, type Plan } from "./budget-api";
import { amountInput, categoryNames, money, parseCents } from "./budget-format";
import { useBudgetAction } from "./use-budget-action";

type Field = "income" | Category;
type Draft = Record<Field, string>;
const fields: readonly Field[] = ["income", ...categories];
export type SaveGuard = RefObject<(() => Promise<boolean>) | null>;

function toDraft(plan: Plan): Draft {
  return { income: amountInput(plan.planned_income_cents), bills: amountInput(plan.allocations.bills),
    everyday: amountInput(plan.allocations.everyday), savings: amountInput(plan.allocations.savings),
    debt: amountInput(plan.allocations.debt), other: amountInput(plan.allocations.other),
    travel: amountInput(plan.allocations.travel), gifts: amountInput(plan.allocations.gifts),
    groceries: amountInput(plan.allocations.groceries) };
}

function readDraft(draft: Draft) {
  const values = {} as Record<Field, number>;
  const errors: Partial<Record<Field, string>> = {};
  for (const field of fields) {
    try { values[field] = parseCents(draft[field]); }
    catch { errors[field] = "Use up to two decimal places, for example 50 or 50,25."; }
  }
  const { income, ...allocations } = values;
  const plan: Plan | null = Object.keys(errors).length ? null : { planned_income_cents: income, allocations };
  return { plan, errors };
}

function allocated(plan: Plan) {
  return categories.reduce((sum, key) => sum + plan.allocations[key], 0);
}

function remainder(plan: Plan) {
  return plan.planned_income_cents - allocated(plan);
}

function PlanFields({ draft, onChange, errors }: {
  draft: Draft; onChange: (next: Draft) => void; errors: Partial<Record<Field, string>>;
}) {
  const prefix = useId();
  return fields.map(field => {
    const id = prefix + "-" + field;
    return <div className="budget-field" key={field}>
      <label htmlFor={id}>{field === "income" ? "Planned income" : categoryNames[field]}</label>
      <input id={id} type="text" inputMode="decimal" required maxLength={9} value={draft[field]}
        aria-invalid={!!errors[field]} aria-describedby={errors[field] ? id + "-error" : undefined}
        onChange={event => onChange({ ...draft, [field]: event.target.value })} />
      {errors[field] && <small className="amount-error" id={id + "-error"} role="alert">{errors[field]}</small>}
    </div>;
  });
}

function ScenarioPanel({ budget, onUse }: { budget: Plan; onUse: (next: Draft) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const result = draft ? readDraft(draft) : null;
  const left = result?.plan ? remainder(result.plan) : null;
  const delta = left === null ? 0 : left - remainder(budget);
  return <section className="budget-panel" aria-labelledby="scenario-heading">
    <div className="budget-row"><h2 id="scenario-heading" tabIndex={-1}>What if?</h2>
      <button className="secondary-button" type="button" aria-expanded={!!draft}
        onClick={() => setDraft(draft ? null : toDraft(budget))}>{draft ? "Discard preview" : "Preview a change"}</button></div>
    {draft && result && <>
      <p className="budget-status">This preview starts from your saved plan.</p>
      <fieldset className="budget-fields" aria-label="Scenario amounts in euros">
        <PlanFields draft={draft} onChange={setDraft} errors={result.errors} />
      </fieldset>
      {left === null ? <p>Enter valid amounts to see the preview.</p> :
        <dl className="budget-totals" aria-live="polite">
          <div><dt>Saved remainder</dt><dd>{money(remainder(budget))}</dd></div>
          <div><dt>Preview remainder</dt><dd>{money(left)}</dd></div>
          <div><dt>Difference</dt><dd>{delta ? money(Math.abs(delta)) + (delta > 0 ? " more left" : " less left") : "Same as saved plan"}</dd></div>
        </dl>}
      <button className="secondary-button" type="button" disabled={!result.plan} onClick={() => {
        onUse(draft); setDraft(null); document.getElementById("plan-heading")?.focus();
      }}>Use this preview</button>
    </>}
  </section>;
}

type Props = { budget: Plan; persist: (plan: Plan) => Promise<Budget>; onSaved: (updated: Budget) => void;
  expireSession: () => void; guard: SaveGuard; isNew?: boolean };

export default function PlanEditor({ budget, persist, onSaved, expireSession, guard, isNew = false }: Props) {
  const [draft, setDraft] = useState(() => toDraft(budget));
  const [saved, setSaved] = useState(false);
  const action = useBudgetAction(expireSession);
  const { plan, errors } = readDraft(draft);
  const initial = toDraft(budget);
  const dirty = fields.some(field => draft[field] !== initial[field]);
  const left = plan ? remainder(plan) : null;

  async function save() {
    if (!plan) return false;
    return action.run(async () => {
      const updated = await persist(plan);
      onSaved(updated);
      setDraft(toDraft(updated));
      setSaved(true);
    });
  }

  useEffect(() => {
    guard.current = dirty ? save : null;
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { guard.current = null; window.removeEventListener("beforeunload", warn); };
  });

  function edit(next: Draft) { setDraft(next); setSaved(false); }

  return <>
    <section className="budget-panel" aria-labelledby="plan-heading">
      <div className="budget-row"><h2 id="plan-heading" tabIndex={-1}>Monthly plan</h2>
        {dirty && <strong className="draft-tag">Unsaved changes</strong>}</div>
      <dl className="budget-totals" aria-live="polite">
        <div><dt>Income</dt><dd>{plan ? money(plan.planned_income_cents) : "—"}</dd></div>
        <div><dt>Total allocated</dt><dd>{plan ? money(allocated(plan)) : "—"}</dd></div>
        <div><dt>Draft remainder</dt><dd>{left === null ? "—" : left < 0 ? money(-left) + " overallocated" : money(left)}</dd></div>
      </dl>
      <form noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset className="budget-fields" aria-label="Plan amounts in euros" disabled={action.pending}>
          <PlanFields draft={draft} onChange={edit} errors={errors} />
        </fieldset>
        <div className="budget-actions">
          <button type="submit" className="primary-button budget-primary" disabled={action.pending || !plan || (!isNew && !dirty)}>
            {action.pending ? "Saving…" : "Save plan"}</button>
          {dirty && <button type="button" className="secondary-button" disabled={action.pending}
            onClick={() => edit(toDraft(budget))}>Discard changes</button>}
        </div>
        {action.error && <p className="form-error" role="alert">{action.error}</p>}
        {saved && <p role="status">Plan saved.</p>}
      </form>
    </section>
    {!isNew && <ScenarioPanel budget={budget} onUse={edit} />}
  </>;
}
