export type Account = { username: string };
export type AuthMode = "login" | "signup";

type Credentials = {
  username: string;
  password: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const apiPathPattern = /^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i;

export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  if (typeof path !== "string" || !apiPathPattern.test(path)) {
    throw new Error("Invalid API request path.");
  }

  const origin = window.location.origin;
  const target = new URL(path, origin);
  if (target.origin !== origin || target.pathname !== path) {
    throw new Error("Invalid API request path.");
  }

  let response: Response;
  try {
    response = await fetch(target.href, {
      ...init,
      mode: "same-origin",
      redirect: "error",
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Couldn’t reach the app. Try again.");
  }
  if (response.status >= 500) {
    throw new Error("The app is temporarily unavailable. Try again.");
  }
  return response;
}

export async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new ApiError(
    typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.",
    response.status,
  );
}

export async function getAccount(signal: AbortSignal): Promise<Account | null> {
  const response = await apiRequest("/api/auth/me", { signal });
  if (response.status === 401) return null;
  await ensureSuccess(response);
  return response.json();
}

export async function authenticate(mode: AuthMode, credentials: Credentials): Promise<Account> {
  const response = await apiRequest("/api/auth/" + mode, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  await ensureSuccess(response);
  return response.json();
}

export async function logout(): Promise<void> {
  await ensureSuccess(await apiRequest("/api/auth/logout", { method: "POST" }));
}
