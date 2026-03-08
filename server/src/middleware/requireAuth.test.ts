import { describe, it, expect, vi } from "vitest";
import { requireAuth } from "./requireAuth.js";

function mockReqRes(user?: { email: string }) {
  const req = { session: { user } } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  const next = vi.fn();
  return { req, res, next };
}

describe("requireAuth", () => {
  it("calls next when user is present", () => {
    const { req, res, next } = mockReqRes({ email: "a@b.com" });
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when user is missing", () => {
    const { req, res, next } = mockReqRes();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });
});
