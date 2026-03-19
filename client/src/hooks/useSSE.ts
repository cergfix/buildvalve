import { useEffect, useRef, useState } from "react";
import type { PipelineRunDetail } from "../api/types";

interface UseSSEOptions<T> {
  /** SSE endpoint URL */
  url: string;
  /** Event name to listen for (default: "message") */
  event?: string;
  /** Whether to connect (set false to disable) */
  enabled?: boolean;
  /** Called when an event is received; return the new state */
  onMessage: (data: unknown, prev: T) => T;
}

/**
 * React hook that connects to a Server-Sent Events endpoint.
 * Automatically reconnects on error. Closes on "done" event.
 */
export function useSSE<T>(initialState: T, options: UseSSEOptions<T>): {
  data: T;
  isConnected: boolean;
  isDone: boolean;
} {
  const { url, event = "message", enabled = true, onMessage } = options;
  const [data, setData] = useState<T>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!enabled || isDone) return;

    const source = new EventSource(url, { withCredentials: true });

    source.addEventListener("open", () => setIsConnected(true));

    source.addEventListener(event, (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data);
        setData((prev) => onMessageRef.current(parsed, prev));
      } catch { /* ignore malformed data */ }
    });

    source.addEventListener("done", () => {
      setIsDone(true);
      setIsConnected(false);
      source.close();
    });

    source.addEventListener("error", () => {
      setIsConnected(false);
      // EventSource will auto-reconnect
    });

    return () => {
      source.close();
      setIsConnected(false);
    };
  }, [url, event, enabled, isDone]);

  return { data, isConnected, isDone };
}

/**
 * Hook for streaming pipeline status via SSE.
 */
export function usePipelineStream(projectId: string, pipelineId: string) {
  const { data, isConnected, isDone } = useSSE(
    null as PipelineRunDetail | null,
    {
      url: `/api/pipelines/${encodeURIComponent(projectId)}/${encodeURIComponent(pipelineId)}/stream`,
      event: "status",
      onMessage: (msg) => msg as PipelineRunDetail,
    }
  );

  return { data, isConnected, isDone };
}

/**
 * Hook for streaming job logs via SSE.
 */
export function useLogStream(projectId: string, jobId: string, pipelineId?: string) {
  const [logs, setLogs] = useState<string>("");
  const params = pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : "";

  const { isConnected, isDone } = useSSE(
    "",
    {
      url: `/api/pipelines/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/trace/stream${params}`,
      event: "logs",
      onMessage: (msg) => {
        const { logs: newLogs } = msg as { logs: string };
        setLogs(newLogs);
        return newLogs;
      },
    }
  );

  return { logs, isConnected, isDone };
}
