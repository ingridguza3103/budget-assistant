export type Account = { username: string };
export type AuthMode = "login" | "signup";

type Credentials = {
  username: string;
  password: string;
};

async function authRequest(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch("/api/auth/" + path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Couldn’t reach the app. Try again.");
  }
  if (response.status >= 500) {
    throw new Error("The app is temporarily unavailable. Try again.");
  }
  return response;
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.");
}

export async function getAccount(signal: AbortSignal): Promise<Account | null> {
  const response = await authRequest("me", { signal });
  if (response.status === 401) return null;
  await ensureSuccess(response);
  return response.json();
}

export async function authenticate(mode: AuthMode, credentials: Credentials): Promise<Account> {
  const response = await authRequest(mode, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  await ensureSuccess(response);
  return response.json();
}

export async function logout(): Promise<void> {
  await ensureSuccess(await authRequest("logout", { method: "POST" }));
}
