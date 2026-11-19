import { type FormEvent, useState } from "react";
import {
  type Budget, type Forecast, type ForecastMonth, readForecast, saveForecast, setForecastSource,
} from "./budget-api";
import { amountInput, money, monthName, parseStartingBalance } from "./budget-format";
import { useBudgetAction, useBudgetData } from "./use-budget-action";
import "./forecast.css";

type Props = { budgets: Budget[]; expireSession: () => void; onOpen: (month: string) => void };

function BalanceChart({ forecast }: { forecast: Forecast }) {
  const { low, high } = forecast.months.reduce((bounds, month) => ({
    low: Math.min(bounds.low, month.planned_balance_cents, month.forecast_balance_cents,
      month.actual_balance_cents ?? forecast.starting_balance_cents),
    high: Math.max(bounds.high, month.planned_balance_cents, month.forecast_balance_cents,
      month.actual_balance_cents ?? forecast.starting_balance_cents),
  }), { low: Math.min(0, forecast.starting_balance_cents), high: Math.max(0, forecast.starting_balance_cents) });
  const span = high - low || 1;
  const zero = -low / span * 100;
  return <figure className="forecast-chart">
    <figcaption>Month-end balances</figcaption>
    <ul className="forecast-legend">
      <li><i className="forecast-plan" />Plan</li>
      <li><i className="forecast-projection" />Forecast</li>
      <li><i className="forecast-actual" />Actual</li>
    </ul>
    <div aria-hidden="true">{forecast.months.map(month => <div className="forecast-chart-row" key={month.budget_id}>
      <span>{monthName(month.month)}</span>
      <div className="forecast-tracks">
        <i className="forecast-zero" style={{ left: zero + "%" }} />
        {([["forecast-plan", month.planned_balance_cents], ["forecast-projection", month.forecast_balance_cents],
          ["forecast-actual", month.actual_balance_cents]] as const).map(([className, value]) =>
            <div className="forecast-track" key={className}>
              {value !== null && <b className={className} style={{
                left: (value >= 0 ? zero : (value - low) / span * 100) + "%",
                width: Math.abs(value) / span * 100 + "%",
              }} />}
            </div>)}
      </div>
    </div>)}</div>
  </figure>;
}

function ForecastTable({ forecast, pending, target, error, notice, onSource, onOpen }: {
  forecast: Forecast; pending: boolean; target: number | null; error: string; notice: string;
  onSource: (month: ForecastMonth) => void; onOpen: (month: string) => void;
}) {
  return <div className="budget-table-wrap forecast-table-wrap" role="region" aria-label="Monthly balance forecast">
    <table className="budget-table forecast-table">
      <caption>All balances include your starting amount. Recorded net is income received minus recorded outflow.</caption>
      <thead><tr><th scope="col">Month</th><th scope="col">Planned net</th><th scope="col">Recorded net</th>
        <th scope="col">Plan end</th><th scope="col">Forecast end</th><th scope="col">Actual end</th><th scope="col">Forecast source</th></tr></thead>
      <tbody>{forecast.months.map(month => <tr key={month.budget_id}>
        <th scope="row"><button type="button" className="forecast-month-link" onClick={() => onOpen(month.month)}>
          {monthName(month.month)}</button></th>
        <td>{money(month.planned_remainder_cents)}</td>
        <td>{money(month.recorded_remainder_cents)}</td>
        <td>{money(month.planned_balance_cents)}</td>
        <td><strong>{money(month.forecast_balance_cents)}</strong></td>
        <td>{month.actual_balance_cents === null ? "—" : money(month.actual_balance_cents)}</td>
        <td><label className="forecast-source"><input type="checkbox" checked={month.use_actuals} disabled={pending}
          aria-label={"Use actuals for " + monthName(month.month)} onChange={() => onSource(month)} />Use actuals</label>
          {target === month.budget_id && error && <p role="alert" className="form-error">{error}</p>}
          {target === month.budget_id && notice && <p role="status" className="budget-status">{notice}</p>}
        </td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ForecastDetails({ forecast, budgets, expireSession, onOpen, onChange }: Props & {
  forecast: Forecast; onChange: (next: Forecast) => void;
}) {
  const [balance, setBalance] = useState(() => amountInput(forecast.starting_balance_cents));
  const [from, setFrom] = useState(forecast.from_month ?? "");
  const [balanceError, setBalanceError] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const action = useBudgetAction(expireSession);
  const choices = [...new Set([...budgets.map(budget => budget.month), ...forecast.months.map(month => month.month),
    ...(forecast.from_month ? [forecast.from_month] : [])])].sort((first, second) => first.localeCompare(second));
  const lastMonth = forecast.months.at(-1)?.month;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let starting: number;
    try { starting = parseStartingBalance(balance); }
    catch {
      setBalanceError("Use an amount from -999999.99 to 999999.99 with up to two decimal places.");
      return;
    }
    setBalanceError(""); setTarget(null); setNotice("");
    void action.run(async () => {
      const updated = await saveForecast({ starting_balance_cents: starting, from_month: from || null });
      onChange(updated);
      setBalance(amountInput(updated.starting_balance_cents));
      setNotice("Forecast settings saved.");
    });
  }
  function changeSource(month: ForecastMonth) {
    setTarget(month.budget_id); setNotice("");
    void action.run(async () => {
      onChange(await setForecastSource(month.budget_id, !month.use_actuals));
      setNotice(month.use_actuals ? "Using the saved plan." : "Using recorded activity.");
    });
  }

  return <>
    <form className="forecast-settings" onSubmit={save} noValidate>
      <fieldset className="budget-fields" disabled={action.pending}>
        <legend>Starting point</legend>
        <label className="budget-field" htmlFor="forecast-balance">Starting balance (€)
          <input id="forecast-balance" type="text" maxLength={11} required value={balance}
            aria-invalid={!!balanceError} aria-describedby={balanceError ? "forecast-balance-error" : "forecast-start-hint"}
            onChange={event => { setBalance(event.target.value); setBalanceError(""); }} />
        </label>
        <label className="budget-field">Forecast from
          <select value={from} onChange={event => setFrom(event.target.value)}>
            <option value="">First saved month</option>
            {choices.map(month => <option key={month} value={month}>{monthName(month)}</option>)}
          </select>
        </label>
      </fieldset>
      <p id="forecast-start-hint" className="budget-status">Enter the balance before the first included month. You can start below zero.</p>
      {balanceError && <p id="forecast-balance-error" className="form-error" role="alert">{balanceError}</p>}
      <button type="submit" className="primary-button budget-primary" disabled={action.pending}>
        {action.pending && target === null ? "Saving…" : "Save starting balance"}</button>
      {target === null && action.error && <p role="alert" className="form-error">{action.error}</p>}
      {target === null && notice && <p role="status" className="budget-status">{notice}</p>}
    </form>
    <dl className="forecast-totals">
      <div><dt>Plan at end</dt><dd>{money(forecast.planned_end_balance_cents)}</dd>
        {lastMonth && <small>Through {monthName(lastMonth)}</small>}</div>
      <div><dt>Forecast at end</dt><dd>{money(forecast.forecast_end_balance_cents)}</dd>
        <small>Actuals for selected months, plans for the rest</small></div>
      <div><dt>Actual balance</dt><dd>{money(forecast.actual_balance_cents)}</dd>
        <small>{forecast.actual_through_month ? "Through " + monthName(forecast.actual_through_month) : "Starting balance"}</small></div>
    </dl>
    {forecast.months.length ? <>
      <p className="budget-status">Use actuals when a month’s activity is complete. Only saved months contribute to this forecast.</p>
      <BalanceChart forecast={forecast} />
      <ForecastTable forecast={forecast} pending={action.pending} target={target} error={action.error} notice={notice}
        onSource={changeSource} onOpen={onOpen} />
      <p className="budget-status">Actual end balances appear once all earlier included months also use actuals.</p>
    </> : <p className="budget-status">Create a budget in this range to build your forecast.</p>}
  </>;
}

export default function ForecastDashboard({ budgets, expireSession, onOpen }: Props) {
  const report = useBudgetData(readForecast, expireSession);
  return <section className="budget-panel forecast-panel" aria-labelledby="forecast-heading">
    <h2 id="forecast-heading" tabIndex={-1}>Balance forecast</h2>
    {report.loading && <p role="status" className="budget-status">Loading your forecast…</p>}
    {!report.loading && report.error &&
      <p role="alert" className="form-error">{report.error} <button type="button" className="secondary-button" onClick={report.retry}>Retry forecast</button></p>}
    {!report.loading && !report.error && report.data &&
      <ForecastDetails forecast={report.data} budgets={budgets} expireSession={expireSession}
        onOpen={onOpen} onChange={report.setData} />}
  </section>;
}
