import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { type Account, type AuthMode, authenticate, getAccount, logout } from "./api";
import BudgetWorkspace from "./BudgetWorkspace";

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
      <span>Budget Assistant</span>
    </div>
  );
}

function BudgetIllustration() {
  return (
    <aside className="budget-illustration" aria-hidden="true">
      <div className="illustration-sheet" />
      <div className="illustration-pie" />
      <div className="illustration-slip">
        <span />
        <span />
        <span />
      </div>
    </aside>
  );
}

function AuthForm({ onAccount }: { onAccount: (account: Account) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const signingUp = mode === "signup";
  const action = signingUp ? "Sign up" : "Log in";

  function switchMode() {
    setMode(signingUp ? "login" : "signup");
    setPassword("");
    setPasswordVisible(false);
    setError("");
    usernameInput.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      onAccount(await authenticate(mode, { username, password }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-heading">
      <h1 id="auth-heading">{signingUp ? "Create your account" : "Log in"}</h1>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            ref={usernameInput}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={signingUp ? "username-hint" : undefined}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError("");
            }}
            maxLength={64}
            required
          />
          {signingUp && <p className="field-hint" id="username-hint">Letters and numbers only. Capitalization matters.</p>}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-wrap">
            <input
              id="password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete={signingUp ? "new-password" : "current-password"}
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={signingUp ? "password-hint" : undefined}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              maxLength={128}
              required
            />
            <button
              type="button"
              className="show-password"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              onClick={() => setPasswordVisible(!passwordVisible)}
            >
              {passwordVisible ? "Hide" : "Show"}
            </button>
          </div>
          {signingUp && <p className="field-hint" id="password-hint">Use at least 8 characters.</p>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? (signingUp ? "Creating account…" : "Logging in…") : action}
        </button>
      </form>
      <p className="auth-switch">
        {signingUp ? "Already have an account?" : "New here?"}{" "}
        <button type="button" onClick={switchMode} disabled={pending}>
          {signingUp ? "Log in" : "Sign up"}
        </button>
      </p>
    </section>
  );
}

function MyBudgets({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function endSession() {
    setError("");
    setPending(true);
    try {
      await logout();
      onLogout();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t log out. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <Brand />
        <div className="account-controls">
          <span className="account-name" title={account.username}>{account.username}</span>
          <button type="button" className="secondary-button" onClick={endSession} disabled={pending}>
            {pending ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>
      <main className="budgets">
        {error && <p className="form-error" role="alert">{error}</p>}
        <BudgetWorkspace expireSession={onLogout} />
      </main>
    </>
  );
}

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [checkNumber, setCheckNumber] = useState(0);
  const clearAccount = useCallback(() => setAccount(null), []);

  useEffect(() => {
    const controller = new AbortController();
    getAccount(controller.signal)
      .then((current) => {
        if (!controller.signal.aborted) setAccount(current);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [checkNumber]);

  if (account) return <MyBudgets account={account} onLogout={clearAccount} />;

  return (
    <>
      <header className="site-header"><Brand /></header>
      <main className="auth-layout">
        {checking ? (
          <section className="auth-panel status-panel"><p role="status">Checking your session…</p></section>
        ) : error ? (
          <section className="auth-panel status-panel">
            <p role="alert">{error}</p>
            <button type="button" className="secondary-button" onClick={() => {
              setChecking(true);
              setError("");
              setCheckNumber((previous) => previous + 1);
            }}>Try again</button>
          </section>
        ) : (
          <AuthForm onAccount={setAccount} />
        )}
        <BudgetIllustration />
      </main>
    </>
  );
}
