import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, History as HistoryIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { pipelinesApi } from "../api/queries";
import type { RecentPipeline, ResolvedPipeline } from "../api/types";
import { PageHead } from "../components/ui/page-head";
import { SectionHead } from "../components/ui/section-head";
import { Chip, type ChipTone } from "../components/ui/chip";
import { StatusChip } from "../components/ui/status-chip";
import { Btn } from "../components/ui/btn";

const RUNNING = new Set(["running", "pending", "created"]);

interface FlatRun {
  projectId: string;
  projectName: string;
  pipelineName: string;
  provider?: string;
  ref: string;
  status: string;
  runId: string;
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

export function RecentRunsPage() {
  const { projects } = useAuth();
  const navigate = useNavigate();

  const { data: recent, isLoading, error } = useQuery({
    queryKey: ["recentPipelines"],
    queryFn: pipelinesApi.getRecent,
    refetchInterval: 5000,
  });

  const flat: FlatRun[] = useMemo(() => {
    if (!recent || !projects) return [];
    const out: FlatRun[] = [];
    for (const projectRecent of recent) {
      const project = projects.find((p) => p.id === projectRecent.projectId);
      if (!project) continue;
      const configs = project.pipelines as unknown as ResolvedPipeline[];
      for (const run of projectRecent.pipelines as RecentPipeline[]) {
        const cfg = configs.find(
          (c) => c.ref === run.ref && (!run.provider || !c.providerType || c.providerType === run.provider)
        );
        if (!cfg) continue;
        out.push({
          projectId: project.id,
          projectName: project.name,
          pipelineName: cfg.name,
          provider: run.provider ?? cfg.providerType,
          ref: run.ref,
          status: run.status,
          runId: run.id,
        });
      }
    }
    return out;
  }, [recent, projects]);

  const counts = useMemo(() => {
    const c = { total: 0, running: 0 };
    for (const r of flat) {
      c.total += 1;
      if (RUNNING.has(r.status)) c.running += 1;
    }
    return c;
  }, [flat]);

  return (
    <div>
      <PageHead
        kicker={
          <>
            <span>workspace</span>
            <span>·</span>
            <span>recent</span>
          </>
        }
        title="recent runs"
        slashed
        sub={
          counts.running > 0
            ? `${counts.total} runs across your projects · ${counts.running} in-flight right now.`
            : `${counts.total} runs across your projects.`
        }
      />

      <SectionHead color="sky">runs</SectionHead>

      {isLoading && flat.length === 0 ? (
        <div className="text-fg-mute italic">loading…</div>
      ) : error ? (
        <div className="text-rose">Failed to load recent runs.</div>
      ) : flat.length === 0 ? (
        <div className="history-empty">
          <HistoryIcon size={20} />
          <span>no recent runs across your projects yet</span>
        </div>
      ) : (
        <div className="history-list">
          <div className="history-head">
            <span>run</span>
            <span>project</span>
            <span>pipeline</span>
            <span>ref</span>
            <span>status</span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          {flat.map((r) => {
            const state = rowState(r.status);
            const goRun = () =>
              navigate(
                `/project/${encodeURIComponent(r.projectId)}/pipeline/${encodeURIComponent(r.pipelineName)}/run/${r.runId}`
              );
            return (
              <div
                key={`${r.projectId}-${r.pipelineName}-${r.runId}`}
                className="history-row"
                data-state={state}
                onClick={goRun}
                role="button"
                tabIndex={0}
              >
                <span className="history-id">#{r.runId}</span>
                <span className="dim">{r.projectName}</span>
                <span className="dim">{r.pipelineName}</span>
                <Chip tone={refTone(r.provider)}>{r.ref}</Chip>
                <StatusChip state={r.status} />
                <span />
                <span />
                <span className="history-actions" onClick={(e) => e.stopPropagation()}>
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
