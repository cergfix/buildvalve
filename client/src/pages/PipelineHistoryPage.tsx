import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Play, Terminal as TerminalIcon, ArrowRight, History as HistoryIcon } from "lucide-react";
import { pipelinesApi } from "../api/queries";
import type { PipelineHistoryEntry } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { Crumb } from "../components/ui/crumb";
import { PageHead } from "../components/ui/page-head";
import { SectionHead } from "../components/ui/section-head";
import { Btn } from "../components/ui/btn";
import { StatBox } from "../components/ui/stat-box";
import { Chip, type ChipTone } from "../components/ui/chip";
import { StatusChip } from "../components/ui/status-chip";

const RUNNING = new Set(["running", "pending", "created"]);
type Filter = "all" | "success" | "failed" | "running";

function kebab(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function refTone(provider?: string): ChipTone {
  if (provider === "gitlab") return "amber";
  if (provider === "github-actions" || provider === "github") return "violet";
  if (provider === "circleci") return "emerald";
  return "sky";
}

function rowState(status: string): "success" | "failed" | "running" | "canceled" | "pending" {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (RUNNING.has(status)) return "running";
  if (status === "canceled") return "canceled";
  return "pending";
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function PipelineHistoryPage() {
  const { projectId, pipelineName } = useParams();
  const navigate = useNavigate();
  const { projects } = useAuth();

  const project = projects?.find((p) => p.id === projectId);
  const pipelineConfig = project?.pipelines.find((p) => p.name === pipelineName);

  const { data: history, isLoading, error } = useQuery({
    queryKey: ["pipelineHistory", projectId, pipelineConfig?.ref],
    queryFn: () => pipelinesApi.getHistory(projectId!, pipelineConfig!.ref),
    enabled: !!pipelineConfig,
    refetchInterval: 5000,
  });

  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { total: 0, success: 0, failed: 0, running: 0 };
    for (const h of history ?? []) {
      c.total += 1;
      if (h.status === "success") c.success += 1;
      else if (h.status === "failed") c.failed += 1;
      else if (RUNNING.has(h.status)) c.running += 1;
    }
    return c;
  }, [history]);

  const filtered = useMemo(() => {
    if (!history) return [];
    if (filter === "all") return history;
    if (filter === "running") return history.filter((h) => RUNNING.has(h.status));
    return history.filter((h) => h.status === filter);
  }, [history, filter]);

  if (!project || !pipelineConfig) {
    return <div className="text-fg-mute italic">Pipeline not found.</div>;
  }

  const provider =
    (pipelineConfig as unknown as { providerType?: string }).providerType ??
    (project as unknown as { providerType?: string }).providerType ??
    project.provider;

  return (
    <div>
      <Crumb onClick={() => navigate("/")}>Back to pipelines</Crumb>

      <PageHead
        kicker={
          <>
            <span>history</span>
            <span>·</span>
            <span>{project.name}</span>
            <span>·</span>
            <span>provider: {provider}</span>
          </>
        }
        title={kebab(pipelineConfig.name)}
        slashed
        sub="Past executions for this pipeline. Click any run to view its live status, jobs and logs."
        action={
          <Btn
            variant="primary"
            icon={<Play size={12} />}
            onClick={() =>
              navigate(`/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipelineConfig.name)}`)
            }
          >
            launch new
          </Btn>
        }
      />

      <SectionHead color="sky">overview</SectionHead>
      <div className="history-stats">
        <StatBox label="total runs" value={counts.total} accent="muted" />
        <StatBox label="success" value={counts.success} accent="emerald" />
        <StatBox label="failed" value={counts.failed} accent="rose" />
        <StatBox label="in-flight" value={counts.running} accent="amber" />
      </div>

      <SectionHead color="emerald">runs</SectionHead>

      <div className="history-filter">
        {(["all", "success", "failed", "running"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`history-filter-btn ${filter === f ? "active" : ""}`}
            data-id={f}
            onClick={() => setFilter(f)}
          >
            <span>{f}</span>
            <span className="count">
              {f === "all" ? counts.total : f === "success" ? counts.success : f === "failed" ? counts.failed : counts.running}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-fg-mute italic">loading history…</div>
      ) : error ? (
        <div className="text-rose">Failed to load pipeline history.</div>
      ) : filtered.length === 0 ? (
        <div className="history-empty">
          <HistoryIcon size={20} />
          <span>no runs matching "{filter}"</span>
        </div>
      ) : (
        <div className="history-list">
          <div className="history-head">
            <span>run</span>
            <span>ref</span>
            <span>version</span>
            <span>status</span>
            <span>when</span>
            <span>duration</span>
            <span>triggered by</span>
            <span></span>
          </div>
          {filtered.map((run: PipelineHistoryEntry) => {
            const state = rowState(run.status);
            const goRun = () =>
              navigate(
                `/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipelineConfig.name)}/run/${run.id}`
              );
            return (
              <div
                key={run.id}
                className="history-row"
                data-state={state}
                onClick={goRun}
                role="button"
                tabIndex={0}
              >
                <span className="history-id">#{run.id}</span>
                <Chip tone={refTone(run.provider)}>{run.ref}</Chip>
                <span className="mono dim">—</span>
                <StatusChip state={run.status} />
                <span className="dim">{relativeTime(run.created_at)}</span>
                <span className="duration">{formatDuration(run.duration)}</span>
                <span className="dim">—</span>
                <span className="history-actions" onClick={(e) => e.stopPropagation()}>
                  <Btn
                    variant="ghost"
                    icon={<TerminalIcon size={12} />}
                    onClick={() => {
                      // Logs view requires a specific job id — open the run, user picks the job there.
                      goRun();
                    }}
                  >
                    logs
                  </Btn>
                  <Btn variant="ghost" iconRight={<ArrowRight size={12} />} onClick={goRun}>
                    view
                  </Btn>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
