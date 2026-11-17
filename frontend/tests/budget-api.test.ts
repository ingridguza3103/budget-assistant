import { afterEach, expect, test, vi } from "vitest";
import { deleteEntry, readActivity } from "../src/budget-api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const request = vi.fn(async () => Response.json({ entries: [] }));
  vi.stubGlobal("fetch", request);
  return request;
}

test("uses the current origin and sends integer and UUID route segments", async () => {
  const request = stubFetch();
  const { signal } = new AbortController();
  const entryId = "12345678-1234-4abc-8abc-1234567890ab";
  const origin = window.location.origin;
  await readActivity(42, signal);
  await deleteEntry(42, entryId);
  expect(request).toHaveBeenNthCalledWith(1, origin + "/api/budgets/42/activity",
    expect.objectContaining({ signal, mode: "same-origin", redirect: "error" }));
  expect(request).toHaveBeenNthCalledWith(2, origin + "/api/budgets/42/entries/" + entryId,
    expect.objectContaining({ method: "DELETE", mode: "same-origin", redirect: "error" }));
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "42" as unknown as number])(
  "rejects invalid budget IDs before making a request (%s)", async (id) => {
    const request = stubFetch();
    await expect(readActivity(id, new AbortController().signal)).rejects.toThrow("Invalid budget ID.");
    expect(request).not.toHaveBeenCalled();
  },
);

test("rejects a non-UUID record ID before making a request", async () => {
  const request = stubFetch();
  await expect(deleteEntry(42, "invalid-id")).rejects.toThrow("Invalid record ID.");
  expect(request).not.toHaveBeenCalled();
});
