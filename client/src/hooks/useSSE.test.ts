import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSSE, usePipelineStream, useLogStream } from "./useSSE";

/**
 * In-memory EventSource stand-in. Lets the test fire "open", "error",
 * arbitrary named events and "done" at the hook to assert state transitions.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  closed = false;
  listeners: Map<string, ((e: any) => void)[]> = new Map();

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = !!init?.withCredentials;
    MockEventSource.instances.push(this);
  }

  addEventListener(name: string, cb: (e: any) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name)!.push(cb);
  }

  close() {
    this.closed = true;
  }

  // Test helpers
  emit(name: string, data?: unknown) {
    const cbs = this.listeners.get(name) ?? [];
    const event = data === undefined ? {} : { data: JSON.stringify(data) };
    for (const cb of cbs) cb(event as MessageEvent);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  // @ts-expect-error — stub the global for the duration of the test.
  globalThis.EventSource = MockEventSource;
});

afterEach(() => {
  // @ts-expect-error
  delete globalThis.EventSource;
});

describe("useSSE", () => {
  it("opens an EventSource with the given URL and withCredentials=true", () => {
    renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage: (m) => m as number })
    );
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/x");
    expect(MockEventSource.instances[0].withCredentials).toBe(true);
  });

  it("flips isConnected=true on 'open'", () => {
    const { result } = renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage: (m) => m as number })
    );
    expect(result.current.isConnected).toBe(false);
    act(() => MockEventSource.instances[0].emit("open"));
    expect(result.current.isConnected).toBe(true);
  });

  it("calls onMessage with parsed JSON for the configured event name", () => {
    const onMessage = vi.fn((m: unknown) => m as number);
    const { result } = renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage })
    );
    act(() => MockEventSource.instances[0].emit("msg", 42));
    expect(onMessage).toHaveBeenCalledWith(42, 0);
    expect(result.current.data).toBe(42);
  });

  it("ignores malformed JSON without crashing", () => {
    const { result } = renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage: (m) => m as number })
    );
    act(() => {
      MockEventSource.instances[0].listeners.get("msg")?.forEach((cb) =>
        cb({ data: "not json {" } as MessageEvent)
      );
    });
    expect(result.current.data).toBe(0);
  });

  it("closes the source and sets isDone=true on 'done'", () => {
    const { result } = renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage: (m) => m as number })
    );
    act(() => MockEventSource.instances[0].emit("done"));
    expect(result.current.isDone).toBe(true);
    expect(result.current.isConnected).toBe(false);
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it("sets isConnected=false on error (browser handles reconnect)", () => {
    const { result } = renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage: (m) => m as number })
    );
    act(() => MockEventSource.instances[0].emit("open"));
    expect(result.current.isConnected).toBe(true);
    act(() => MockEventSource.instances[0].emit("error"));
    expect(result.current.isConnected).toBe(false);
  });

  it("does not connect when enabled=false", () => {
    renderHook(() =>
      useSSE<number>(0, {
        url: "/x",
        event: "msg",
        enabled: false,
        onMessage: (m) => m as number,
      })
    );
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("closes the source on unmount", () => {
    const { unmount } = renderHook(() =>
      useSSE<number>(0, { url: "/x", event: "msg", onMessage: (m) => m as number })
    );
    const src = MockEventSource.instances[0];
    expect(src.closed).toBe(false);
    unmount();
    expect(src.closed).toBe(true);
  });
});

describe("usePipelineStream", () => {
  it("connects to /api/pipelines/:projectId/:pipelineId/stream listening for 'status'", () => {
    renderHook(() => usePipelineStream("p1", "999"));
    expect(MockEventSource.instances[0].url).toBe("/api/pipelines/p1/999/stream");
    expect(MockEventSource.instances[0].listeners.has("status")).toBe(true);
  });

  it("updates data when a 'status' event arrives", () => {
    const { result } = renderHook(() => usePipelineStream("p1", "999"));
    const payload = { pipeline: { id: "999", status: "running" }, jobs: [] };
    act(() => MockEventSource.instances[0].emit("status", payload));
    expect(result.current.data).toEqual(payload);
  });
});

describe("useLogStream", () => {
  it("connects to /api/pipelines/:projectId/jobs/:jobId/trace/stream with pipelineId query", () => {
    renderHook(() => useLogStream("p1", "j1", "999"));
    expect(MockEventSource.instances[0].url).toBe(
      "/api/pipelines/p1/jobs/j1/trace/stream?pipelineId=999"
    );
    expect(MockEventSource.instances[0].listeners.has("logs")).toBe(true);
  });

  it("appends incremental logs from 'logs' events", () => {
    const { result } = renderHook(() => useLogStream("p1", "j1"));
    act(() => MockEventSource.instances[0].emit("logs", { logs: "line one\n" }));
    expect(result.current.logs).toBe("line one\n");
    act(() => MockEventSource.instances[0].emit("logs", { logs: "line one\nline two\n" }));
    expect(result.current.logs).toBe("line one\nline two\n");
  });

  it("flips isDone=true on 'done' from the trace stream", () => {
    const { result } = renderHook(() => useLogStream("p1", "j1"));
    act(() => MockEventSource.instances[0].emit("done"));
    expect(result.current.isDone).toBe(true);
  });
});
