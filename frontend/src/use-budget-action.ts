import { useRef, useState } from "react";
import { ApiError } from "./api";

export function budgetError(failure: unknown, expireSession: () => void): string {
  if (failure instanceof ApiError && failure.status === 401) {
    expireSession();
    return "";
  }
  return failure instanceof Error ? failure.message : "Something went wrong. Try again.";
}

export function useBudgetAction(expireSession: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);

  async function run(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setError("");
    setPending(true);
    try {
      await action();
    } catch (failure) {
      setError(budgetError(failure, expireSession));
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  return { run, pending, error };
}
