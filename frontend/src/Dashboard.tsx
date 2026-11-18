import "./dashboard.css";
import { categories, type Activity, type Category, type Plan } from "./budget-api";
import { categoryNames, money } from "./budget-format";

const swatches: Record<Category, string> = { bills: "#0479a3", everyday: "#d83995", savings: "#6bb7cb", debt: "#41546f" };
const percent = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 1 });

function AllocationChart({ plan, total }: { plan: Plan; total: number }) {
  if (!total) return <p className="budget-status">Add planned allocations to see their breakdown.</p>;
  let position = 0;
  const stops = categories.map(category => {
    const start = position;
    position += plan.allocations[category] / total * 100;
    return `${swatches[category]} ${start}% ${position}%`;
  });
  return <figure className="allocation-chart">
    <div className="allocation-ring" aria-hidden="true" style={{ background: "conic-gradient(" + stops.join(", ") + ")" }} />
    <figcaption><strong>Planned allocation</strong><ul>{categories.map(category =>
      <li key={category}><i style={{ background: swatches[category] }} />{categoryNames[category]}
        <b>{percent.format(plan.allocations[category] / total)}</b></li>
    )}</ul></figcaption>
  </figure>;
}

function CategoryCard({ category, planned, activity }: { category: Category; planned: number; activity: Activity }) {
  const actual = activity.spending[category];
  const goal = category === "savings" || category === "debt";
  const difference = Math.abs(planned - actual);
  let status = "On plan";
  if (planned === 0) status = actual ? (goal ? "Unplanned contribution" : "Unplanned spending") : "No plan yet";
  else if (actual !== planned) {
    const under = goal ? " to target" : " left";
    const over = goal ? " above target" : " over budget";
    status = money(difference) + (actual < planned ? under : over);
  } else if (goal) status = "Target reached";
  const entries = activity.entries.filter(entry => entry.category === category);
  return <article className="category-card">
    <h3>{categoryNames[category]}</h3>
    <div className="category-track" aria-hidden="true">
      <div style={{ width: (planned ? Math.min(actual / planned * 100, 100) : 0) + "%", background: swatches[category] }} />
    </div>
    <table aria-label={categoryNames[category] + " progress"}>
      <thead><tr><th>Planned</th><th>Actual</th><th>{goal ? "Funded" : "Used"}</th></tr></thead>
      <tbody><tr><td>{money(planned)}</td><td>{money(actual)}</td><td>{planned ? percent.format(actual / planned) : "—"}</td></tr></tbody>
    </table>
    <p className={actual > planned && !goal ? "variance-warning" : ""}>{status}</p>
    {entries.length > 0 && <details><summary>{entries.length} {entries.length === 1 ? "entry" : "entries"}</summary>
      <ul>{entries.map(entry => <li key={entry.id}><span>{entry.description || categoryNames[category]}</span>
        <b>{money(entry.amount_cents)}</b></li>)}</ul>
    </details>}
  </article>;
}

export default function Dashboard({ budget, activity, loading = false, error = "", retry }: {
  budget: Plan; activity: Activity | null; loading?: boolean; error?: string; retry?: () => void;
}) {
  const total = categories.reduce((sum, key) => sum + budget.allocations[key], 0);
  const gap = (activity?.income_cents ?? 0) - budget.planned_income_cents;
  return <section className="budget-panel" aria-labelledby="overview-heading">
    <h2 id="overview-heading">Monthly overview</h2>
    <dl className="month-figures">
      <div><dt>Left to allocate</dt><dd>{money(budget.planned_income_cents - total)}</dd></div>
      <div><dt>Actual remainder</dt><dd>{activity ? money(activity.remainder_cents) : (loading ? "Loading…" : "Unavailable")}</dd></div>
    </dl>
    {error && <p className="form-error" role="alert">{error} <button type="button" onClick={retry}>Retry activity</button></p>}
    <AllocationChart plan={budget} total={total} />
    {activity && <>
      <dl className="budget-totals">
        <div><dt>Income received</dt><dd>{money(activity.income_cents)}</dd></div>
        <div><dt>Income vs. plan</dt><dd>{gap ? money(Math.abs(gap)) + (gap > 0 ? " above expected" : " below expected") : "As expected"}</dd></div>
        <div><dt>Recorded outflow</dt><dd>{money(activity.outflow_cents)}</dd></div>
      </dl>
      <div className="category-grid">{categories.map(category =>
        <CategoryCard key={category} category={category} planned={budget.allocations[category]} activity={activity} />
      )}</div>
    </>}
  </section>;
}
