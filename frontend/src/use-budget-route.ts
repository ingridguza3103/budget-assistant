import { useEffect, useRef, useState } from "react";
import { validMonth } from "./MonthPicker";
import type { SaveGuard } from "./PlanEditor";

type Route = { month: string; calendar: boolean };
function readRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("month") ?? "";
  return { month: validMonth(value) ? value : "", calendar: params.get("view") === "calendar" };
}
function urlFor(month: string, calendar: boolean) {
  const params = new URLSearchParams();
  if (validMonth(month)) {
    params.set("month", month);
    if (calendar) params.set("view", "calendar");
  }
  return window.location.pathname + (params.size ? "?" + params.toString() : "");
}

export default function useBudgetRoute(guard: SaveGuard, leave: (next: () => void) => void, clearDraft: () => void) {
  const [route, setRoute] = useState(readRoute);
  const index = useRef<number>(history.state?.budgetStep ?? 0);
  const rollback = useRef(false);
  const approved = useRef(false);
  const callbacks = useRef({ leave, clearDraft });
  useEffect(() => { callbacks.current = { leave, clearDraft }; });

  useEffect(() => {
    if (history.state?.budgetStep === undefined) history.replaceState({ ...history.state, budgetStep: index.current }, "");
    function onPop(event: PopStateEvent) {
      if (rollback.current) { rollback.current = false; return; }
      const next = event.state?.budgetStep ?? 0;
      const delta = next - index.current;
      if (guard.current && !approved.current && delta) {
        rollback.current = true;
        history.go(-delta);
        callbacks.current.leave(() => { approved.current = true; history.go(delta); });
        return;
      }
      approved.current = false;
      index.current = next;
      callbacks.current.clearDraft();
      setRoute(readRoute());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [guard]);

  function navigate(month: string, calendar = false, replace = false) {
    const url = urlFor(month, calendar);
    if (location.pathname + location.search + location.hash !== url) {
      if (replace) history.replaceState({ ...history.state, budgetStep: index.current }, "", url);
      else history.pushState({ budgetStep: ++index.current }, "", url);
    }
    clearDraft();
    setRoute(readRoute());
  }
  return { route, navigate };
}
