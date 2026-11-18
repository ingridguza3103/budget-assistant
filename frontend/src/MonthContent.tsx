import { useCallback, type ReactNode } from "react";
import ActivityPanel from "./ActivityPanel";
import Dashboard from "./Dashboard";
import { type Budget, type Bill, readActivity } from "./budget-api";
import { useBudgetData } from "./use-budget-action";

export default function MonthContent({ budget, expireSession, payment, children }: {
  budget: Budget; expireSession: () => void; children?: ReactNode; payment?: Bill;
}) {
  const load = useCallback((signal: AbortSignal) => readActivity(budget.id, signal), [budget.id]);
  const activity = useBudgetData(load, expireSession);
  return <>
    <Dashboard budget={budget} activity={activity.data} loading={activity.loading} error={activity.error} retry={activity.retry} />
    {children}
    {activity.data && <ActivityPanel budget={budget} expireSession={expireSession}
      payment={payment} activity={activity.data} setActivity={activity.setData} />}
  </>;
}
