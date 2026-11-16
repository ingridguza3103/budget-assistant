import { afterEach, expect, test, vi } from "vitest";
import { authenticate, getAccount, logout } from "../src/api";

const credentials = { username: "BudgetUser8", password: "Demo8abc" };
const account = { username: credentials.username };

afterEach(() => vi.unstubAllGlobals());

function respondWith(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test.each(["signup", "login"] as const)("posts credentials to %s", async (mode) => {
  const request = respondWith(Response.json(account));
  await expect(authenticate(mode, credentials)).resolves.toEqual(account);
  expect(request).toHaveBeenCalledWith("/api/auth/" + mode, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
});

test("loads the current account and forwards the abort signal", async () => {
  const request = respondWith(Response.json(account));
  const { signal } = new AbortController();
  await expect(getAccount(signal)).resolves.toEqual(account);
  expect(request).toHaveBeenCalledWith("/api/auth/me", { signal });
});

test("treats a 401 session response as signed out", async () => {
  respondWith(new Response(null, { status: 401 }));
  await expect(getAccount(new AbortController().signal)).resolves.toBeNull();
});

test("posts to logout", async () => {
  const request = respondWith(new Response(null, { status: 204 }));
  await expect(logout()).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
});

test("returns the server's readable validation message", async () => {
  respondWith(Response.json({ detail: "That username is unavailable." }, { status: 409 }));
  await expect(authenticate("signup", credentials)).rejects.toThrow("That username is unavailable.");
});

test("handles an unexpected response body", async () => {
  respondWith(new Response("unexpected response", { status: 400 }));
  await expect(authenticate("signup", credentials)).rejects.toThrow("Something went wrong.");
});

test("handles a service error", async () => {
  respondWith(new Response(null, { status: 503 }));
  await expect(logout()).rejects.toThrow("The app is temporarily unavailable.");
});

test("handles network errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network error")));
  await expect(logout()).rejects.toThrow("Couldn’t reach the app.");
});

test("preserves a cancelled session request", async () => {
  const abort = new DOMException("Request cancelled", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
  await expect(getAccount(new AbortController().signal)).rejects.toBe(abort);
});
