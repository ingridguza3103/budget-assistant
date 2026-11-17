import { useEffect, useRef, useState } from "react";
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

export function useBudgetData<T>(load: (signal: AbortSignal) => Promise<T>, expireSession: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setData(items);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(budgetError(failure, expireSession));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, expireSession, load]);

  function retry() {
    setError("");
    setLoading(true);
    setAttempt((previous) => previous + 1);
  }

  return { data, setData, loading, error, retry };
}
