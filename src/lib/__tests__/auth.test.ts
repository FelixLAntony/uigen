// @vitest-environment node
import { vi, test, expect, beforeEach } from "vitest";
import { jwtVerify } from "jose";

const mockSet = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ set: mockSet })),
}));

import { createSession } from "@/lib/auth";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  mockSet.mockClear();
});

test("createSession sets an httpOnly auth-token cookie", async () => {
  await createSession("user-123", "test@example.com");

  expect(mockSet).toHaveBeenCalledOnce();
  const [name, , options] = mockSet.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
  expect(options.secure).toBe(false); // NODE_ENV is "test", not "production"
});

test("createSession encodes userId and email in the JWT", async () => {
  await createSession("user-123", "test@example.com");

  const [, token] = mockSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-123");
  expect(payload.email).toBe("test@example.com");
});

test("createSession sets cookie expiry ~7 days from now", async () => {
  const before = Date.now();
  await createSession("user-123", "test@example.com");
  const after = Date.now();

  const [, , options] = mockSet.mock.calls[0];
  const expires: Date = options.expires;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});
