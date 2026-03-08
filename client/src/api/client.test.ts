import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchApi, ApiError } from "./client";

describe("ApiError", () => {
  it("stores status and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("ApiError");
  });
});

describe("fetchApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: "ok" }), { status: 200 })
    );
    const result = await fetchApi<{ data: string }>("/api/test");
    expect(result).toEqual({ data: "ok" });
  });

  it("sets Content-Type header", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    await fetchApi("/api/test");
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("merges custom headers", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    await fetchApi("/api/test", { headers: { "X-Custom": "val" } });
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-Custom"]).toBe("val");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws ApiError with server error message on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );
    try {
      await fetchApi("/api/test");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).message).toBe("Forbidden");
    }
  });

  it("uses fallback error message when response is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("plain text error", { status: 500, headers: { "Content-Type": "text/plain" } })
    );
    try {
      await fetchApi("/api/test");
    } catch (err) {
      expect((err as ApiError).message).toBe("API request failed");
    }
  });

  it("returns empty object when success response has no JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 })
    );
    const result = await fetchApi("/api/logout");
    expect(result).toEqual({});
  });

  it("forwards request options like method and body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    await fetchApi("/api/test", {
      method: "POST",
      body: JSON.stringify({ key: "val" }),
    });
    expect(spy.mock.calls[0][1]?.method).toBe("POST");
    expect(spy.mock.calls[0][1]?.body).toBe('{"key":"val"}');
  });
});
