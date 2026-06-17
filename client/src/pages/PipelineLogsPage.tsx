import { useRef, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLogStream } from "../hooks/useSSE";
import { pipelinesApi, relaunchVariables } from "../api/queries";
import { useAuth } from "../contexts/AuthContext";
import { Crumb } from "../components/ui/crumb";
import { PageHead } from "../components/ui/page-head";
import { Btn } from "../components/ui/btn";
import { SseIndicator } from "../components/ui/sse-indicator";
import { Terminal as TerminalPanel, TerminalLine } from "../components/ui/terminal";
import { Terminal as TerminalIcon, ExternalLink, Rocket, RotateCcw } from "lucide-react";

export function PipelineLogsPage() {
  const { projectId, pipelineName, runId, jobId } = useParams();
  const navigate = useNavigate();
  const { projects } = useAuth();

  const { logs, isConnected, isDone } = useLogStream(projectId!, jobId!, runId);

  // Resolve the job's CI web URL so we can link out to the source pipeline.
  // Reuses the same query key the run page populates, so this is usually a
  // cache hit when navigating here from the run view.
  const { data: runData } = useQuery({
    queryKey: ["pipelineRun", projectId, runId],
    queryFn: () => pipelinesApi.getPipeline(projectId!, runId!),
    staleTime: Infinity,
    enabled: !!projectId && !!runId,
  });
  const jobWebUrl = runData?.jobs.find((j) => j.id === jobId)?.web_url;

  const launchHref = `/project/${encodeURIComponent(projectId!)}/pipeline/${encodeURIComponent(pipelineName!)}`;
  const pipelineConfig = projects
    ?.find((p) => p.id === projectId)
    ?.pipelines.find((p) => p.name === pipelineName);

  // Relaunch the pipeline with the same parameters this run used (see run page).
  const relaunchMutation = useMutation({
    mutationFn: () =>
      pipelinesApi.trigger(
        projectId!,
        pipelineName!,
        relaunchVariables(pipelineConfig?.variables, runData?.triggered_variables)
      ),
    onSuccess: (resp) => {
      toast.success("Pipeline launched again with the same parameters");
      navigate(`${launchHref}/run/${resp.id}`);
    },
    onError: (err: Error) => {
      toast.error("Could not launch pipeline again", { description: err.message });
    },
  });

  // Two-step confirm so a stray click doesn't kick off a fresh pipeline run.
  const [relaunchConfirming, setRelaunchConfirming] = useState(false);
  const relaunchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (relaunchTimerRef.current) clearTimeout(relaunchTimerRef.current);
  }, []);

  const handleRelaunchClick = () => {
    if (!relaunchConfirming) {
      setRelaunchConfirming(true);
      if (relaunchTimerRef.current) clearTimeout(relaunchTimerRef.current);
      relaunchTimerRef.current = setTimeout(() => setRelaunchConfirming(false), 4000);
      return;
    }
    if (relaunchTimerRef.current) clearTimeout(relaunchTimerRef.current);
    setRelaunchConfirming(false);
    relaunchMutation.mutate();
  };

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
      {/* Launch actions live next to the back link (top-left) so they're a
          short cursor hop from navigation while watching/relaunching builds. */}
      <div className="crumb-row">
        <Crumb
          onClick={() =>
            navigate(`/project/${encodeURIComponent(projectId!)}/pipeline/${encodeURIComponent(pipelineName!)}/run/${runId}`)
          }
        >
          Back to run · #{runId}
        </Crumb>
        {isDone ? (
          <div className="run-head-actions">
            <Btn variant="default" icon={<Rocket size={12} />} onClick={() => navigate(launchHref)}>
              new launch
            </Btn>
            <Btn
              variant="primary"
              icon={<RotateCcw size={12} />}
              onClick={handleRelaunchClick}
              disabled={relaunchMutation.isPending}
            >
              {relaunchMutation.isPending
                ? "launching again…"
                : relaunchConfirming
                  ? "confirm launch"
                  : "launch again"}
            </Btn>
          </div>
        ) : null}
      </div>

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
            {jobWebUrl ? (
              <a
                href={jobWebUrl}
                target="_blank"
                rel="noreferrer"
                className="external"
                aria-label="open job in provider"
              >
                <ExternalLink size={18} />
              </a>
            ) : null}
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
