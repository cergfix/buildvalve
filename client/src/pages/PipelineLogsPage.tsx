import { useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLogStream } from "../hooks/useSSE";
import { Crumb } from "../components/ui/crumb";
import { PageHead } from "../components/ui/page-head";
import { SseIndicator } from "../components/ui/sse-indicator";
import { Terminal as TerminalPanel, TerminalLine } from "../components/ui/terminal";
import { Terminal as TerminalIcon } from "lucide-react";

export function PipelineLogsPage() {
  const { projectId, pipelineName, runId, jobId } = useParams();
  const navigate = useNavigate();

  const { logs, isConnected, isDone } = useLogStream(projectId!, jobId!, runId);

  const bodyRef = useRef<HTMLDivElement>(null);
  // Track whether the user is currently pinned to the bottom. If yes, follow
  // new output; if they've scrolled up to read earlier lines, leave them alone.
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      // 40px slack so users don't have to be pixel-perfect at the bottom.
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !wasAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const lines = useMemo(() => (logs ? logs.split(/\r?\n/) : []), [logs]);
  // Don't render a trailing empty line caused by terminating newline.
  const visibleLines = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;

  const wsBase = (window.location.protocol === "https:" ? "wss" : "ws") + "://" + window.location.host;
  const wsUrl = `${wsBase}/api/pipelines/${encodeURIComponent(projectId ?? "")}/runs/${runId}/jobs/${jobId}/logs`;

  return (
    <div>
      <Crumb
        onClick={() =>
          navigate(`/project/${encodeURIComponent(projectId!)}/pipeline/${encodeURIComponent(pipelineName!)}/run/${runId}`)
        }
      >
        Back to run · #{runId}
      </Crumb>

      <PageHead
        kicker={
          <>
            <TerminalIcon size={12} />
            <span>job logs</span>
            <span className="ver">streaming via SSE</span>
          </>
        }
        title={
          <>
            build <span className="muted">#{jobId}</span>
          </>
        }
        slashed
        sub={
          <>
            running in pipeline for <span className="text-fg">{pipelineName}</span> · live-tailing job output.
            Connection retries automatically.
          </>
        }
      />

      <TerminalPanel
        label={`tty/job-${jobId}.log · utf-8`}
        isLive={!isDone}
        visibleLines={visibleLines.length}
        totalLines={visibleLines.length}
        bodyRef={bodyRef}
      >
        {visibleLines.length === 0 ? (
          <span className="text-fg-mute italic">
            {isConnected ? "waiting for output…" : "connecting…"}
          </span>
        ) : (
          visibleLines.map((line, i) => (
            <TerminalLine
              key={i}
              lineNo={i + 1}
              text={line}
              showCursor={!isDone && i === visibleLines.length - 1}
            />
          ))
        )}
      </TerminalPanel>

      <SseIndicator>
        {isDone ? "stream closed" : isConnected ? `connection: ${wsUrl}` : `connecting: ${wsUrl}`}
      </SseIndicator>
    </div>
  );
}
