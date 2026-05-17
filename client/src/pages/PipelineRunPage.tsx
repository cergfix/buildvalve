import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Terminal } from "lucide-react";
import { pipelinesApi } from "../api/queries";
import { usePipelineStream } from "../hooks/useSSE";
import type { CIJobDetail } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { Crumb } from "../components/ui/crumb";
import { SectionHead } from "../components/ui/section-head";
import { Chip } from "../components/ui/chip";
import { StatusChip } from "../components/ui/status-chip";
import { RunStatusChip } from "../components/ui/run-status-chip";
import { StageFlow, type StageInfo, type StageState } from "../components/ui/stage-flow";
import { SseIndicator } from "../components/ui/sse-indicator";

const RUNNING = new Set(["running", "pending", "created"]);
const FAILED = new Set(["failed", "canceled"]);

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

function durationOfJob(job: CIJobDetail): string {
  if (job.started_at && job.finished_at) {
    const diff = (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000;
    return formatDuration(diff);
  }
  if (RUNNING.has(job.status)) return "running…";
  return "—";
}

function computeStages(jobs: CIJobDetail[]): StageInfo[] {
  const groups = new Map<string, CIJobDetail[]>();
  for (const j of jobs) {
    const stage = j.stage || "default";
    if (!groups.has(stage)) groups.set(stage, []);
    groups.get(stage)!.push(j);
  }
  return [...groups.entries()].map(([name, group]) => {
    let state: StageState = "pending";
    if (group.some((j) => FAILED.has(j.status))) state = "failed";
    else if (group.some((j) => RUNNING.has(j.status))) state = "running";
    else if (group.every((j) => j.status === "success")) state = "success";
    else state = "pending";
    return { name, state, jobCount: group.length };
  });
}

function useElapsed(startedIso: string | undefined, running: boolean): string {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!startedIso) return "just now";
  const s = (now - new Date(startedIso).getTime()) / 1000;
  return formatDuration(Math.max(0, s)) + " ago";
}

export function PipelineRunPage() {
  const { projectId, pipelineName, runId } = useParams();
  const navigate = useNavigate();
  const { user, projects } = useAuth();

  const project = projects?.find((p) => p.id === projectId);

  const { data: initialData, isLoading, error } = useQuery({
    queryKey: ["pipelineRun", projectId, runId],
    queryFn: () => pipelinesApi.getPipeline(projectId!, runId!),
    staleTime: Infinity,
  });

  const { data: streamData, isConnected } = usePipelineStream(projectId!, runId!);
  const data = streamData ?? initialData;

  const stages = useMemo(() => (data ? computeStages(data.jobs) : []), [data]);
  const isRunning = !!data && RUNNING.has(data.pipeline.status);
  const elapsed = useElapsed(data?.pipeline.created_at, isRunning);

  if (isLoading && !data) {
    return (
      <div className="text-fg-mute flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> loading run…
      </div>
    );
  }
  if (error && !data) {
    return <div className="text-rose">Error loading pipeline run</div>;
  }
  if (!data) return null;

  const { pipeline, jobs } = data;
  const status = pipeline.status;
  const failedJob = jobs.find((j) => FAILED.has(j.status));
  const totalDuration = (() => {
    if (!pipeline.created_at || !pipeline.updated_at) return null;
    return (new Date(pipeline.updated_at).getTime() - new Date(pipeline.created_at).getTime()) / 1000;
  })();

  const metaTail = (() => {
    if (status === "success" && totalDuration != null)
      return <span>completed · {formatDuration(totalDuration)}</span>;
    if (FAILED.has(status) && totalDuration != null)
      return (
        <span>
          failed{failedJob ? <> at <span className="text-rose">{failedJob.stage}</span></> : null} ·{" "}
          {formatDuration(totalDuration)} elapsed
        </span>
      );
    return <span>started {elapsed}</span>;
  })();

  const provider =
    pipeline.provider ??
    (project as unknown as { providerType?: string } | undefined)?.providerType ??
    project?.provider ??
    "—";

  return (
    <div>
      <Crumb onClick={() => navigate("/")}>Back to pipelines</Crumb>

      <div className="page-kicker" style={{ marginBottom: 8 }}>
        <span>run</span>
        <span>·</span>
        <span>{project?.name ?? "project"}</span>
        <span>·</span>
        <span>{provider}</span>
      </div>

      <div className="run-head">
        <div>
          <h1 className="run-id">
            <span>run</span>
            <span className="hash">#{pipeline.id}</span>
            <a
              href={pipeline.web_url}
              target="_blank"
              rel="noreferrer"
              className="external"
              aria-label="open in provider"
            >
              <ExternalLink size={18} />
            </a>
          </h1>
          <div className="run-meta">
            <span>
              launched: <span className="text-fg">{pipelineName}</span>
            </span>
            <Chip tone="sky">{pipeline.ref}</Chip>
            <span>·</span>
            <span>by {user?.email}</span>
            <span>·</span>
            {metaTail}
          </div>
        </div>
        <RunStatusChip state={status} />
      </div>

      <SectionHead color="amber">pipeline stages</SectionHead>
      {stages.length > 0 ? <StageFlow stages={stages} /> : <div className="text-fg-mute italic">No stages yet.</div>}

      <SectionHead color="sky">jobs{isRunning ? " · live" : ""}</SectionHead>

      {jobs.length === 0 ? (
        <div className="text-fg-mute italic">No jobs found or pipeline hasn't started yet.</div>
      ) : (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>stage</th>
              <th>job</th>
              <th>status</th>
              <th>duration</th>
              <th className="end">logs</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="stage-cell">{job.stage}</td>
                <td className="job-name">
                  {job.name}
                  <span className="id">#{job.id}</span>
                </td>
                <td>
                  <StatusChip state={job.status} />
                </td>
                <td>
                  <span className={`duration ${RUNNING.has(job.status) || job.status === "pending" ? "dim" : ""}`}>
                    {durationOfJob(job)}
                  </span>
                </td>
                <td className="end">
                  <button
                    type="button"
                    className="view-logs"
                    onClick={() =>
                      navigate(
                        `/project/${encodeURIComponent(projectId!)}/pipeline/${encodeURIComponent(pipelineName!)}/run/${runId}/job/${job.id}/logs`
                      )
                    }
                  >
                    <Terminal size={12} /> view logs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isRunning ? (
        <SseIndicator>
          {isConnected ? `live streaming via SSE · ${elapsed.replace(" ago", "")}` : "connecting…"}
        </SseIndicator>
      ) : null}
    </div>
  );
}
