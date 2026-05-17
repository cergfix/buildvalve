import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Play, History } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { pipelinesApi } from "../api/queries";
import type { RecentProjectPipelines, RecentPipeline, ResolvedPipeline } from "../api/types";
import { PageHead } from "../components/ui/page-head";
import { SectionHead } from "../components/ui/section-head";
import { FlowDiagram } from "../components/ui/flow-diagram";
import { ProviderChip } from "../components/ui/provider-chip";
import { StatusChip } from "../components/ui/status-chip";
import { Chip, type ChipTone } from "../components/ui/chip";
import { Btn } from "../components/ui/btn";

const RUNNING_STATES = new Set(["running", "pending", "created"]);

function refTone(provider?: string): ChipTone {
  if (provider === "gitlab") return "amber";
  if (provider === "github-actions" || provider === "github") return "violet";
  if (provider === "circleci") return "emerald";
  return "sky";
}

function rowState(running?: RecentPipeline, last?: RecentPipeline): "running" | "success" | "failed" | "idle" {
  if (running) return "running";
  if (last?.status === "success") return "success";
  if (last?.status === "failed") return "failed";
  return "idle";
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

export function PipelinesPage() {
  const { projects } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: recentData } = useQuery({
    queryKey: ["recentPipelines"],
    queryFn: pipelinesApi.getRecent,
    refetchInterval: 5000,
  });

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const q = searchQuery.toLowerCase();
    if (!q) return projects;
    return projects
      .map((project) => {
        const isProjectMatch =
          project.name.toLowerCase().includes(q) ||
          (project.description && project.description.toLowerCase().includes(q));
        if (isProjectMatch) return project;
        const matching = project.pipelines.filter(
          (p) => p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q)
        );
        return { ...project, pipelines: matching };
      })
      .filter((project) => project.pipelines.length > 0);
  }, [projects, searchQuery]);

  if (!projects || projects.length === 0) {
    return (
      <div className="text-fg-mute italic">You do not have access to any projects.</div>
    );
  }

  const totalAccessible = filteredProjects.length;

  return (
    <div>
      <PageHead
        kicker={
          <>
            <span>BUILDVALVE</span>
            <span className="ver">v{__APP_VERSION__} ▸ /pipelines</span>
          </>
        }
        title="pipelines"
        slashed
        sub="Tell BuildValve what to launch. Trigger CI/CD pipelines across all your allowed projects — without giving anyone direct CI access."
      />

      <div className="search">
        <Search size={14} className="opacity-70" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="search projects, pipelines, or refs..."
        />
        <span className="kbd">
          <span>⌘</span>
          <span>K</span>
        </span>
      </div>

      <SectionHead color="emerald" flowHead>
        how to launch
      </SectionHead>
      <FlowDiagram />

      <SectionHead>projects — {totalAccessible} accessible</SectionHead>

      {filteredProjects.length === 0 ? (
        <div className="text-fg-mute italic py-10 text-center">
          no projects or pipelines match "{searchQuery}"
        </div>
      ) : (
        filteredProjects.map((project) => {
          const projectRecent: RecentProjectPipelines | undefined = recentData?.find(
            (r) => r.projectId === project.id
          );
          const projectPipelines: RecentPipeline[] = projectRecent?.pipelines || [];

          return (
            <section key={project.id} className="project">
              <div className="project-head">
                <h2 className="project-name">{project.name}</h2>
                <ProviderChip type={project.provider} />
              </div>
              <div className="project-desc">
                {project.description ? <span>{project.description}</span> : null}
                {project.description ? <span className="sep">|</span> : null}
                <span>id: {project.id}</span>
                <span className="sep">|</span>
                <span>pipelines: {project.pipelines.length}</span>
              </div>

              <div className="pipe-list-head">
                <span>pipeline</span>
                <span>ref</span>
                <span>last run</span>
                <span>status</span>
                <span className="end">action</span>
              </div>

              <div className="pipe-list">
                {(project.pipelines as unknown as ResolvedPipeline[]).map((pipeline) => {
                  const matching = projectPipelines.filter(
                    (p) =>
                      p.ref === pipeline.ref &&
                      (!p.provider || !pipeline.providerType || p.provider === pipeline.providerType)
                  );
                  const running = matching.find((p) => RUNNING_STATES.has(p.status));
                  const last = matching.find((p) => !RUNNING_STATES.has(p.status));
                  const state = rowState(running, last);
                  const linkTarget = running ?? last;
                  const lastIso = last?.web_url ? undefined : undefined; // no created_at on recent payload
                  const lastLabel = last ? relativeTime(lastIso) || "recent" : "—";

                  const openRun = () => {
                    if (!linkTarget) return;
                    navigate(
                      `/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}/run/${linkTarget.id}`
                    );
                  };

                  return (
                    <div key={pipeline.name} className="pipe-row" data-state={state}>
                      <div className="pipe-name">
                        <span className="marker" aria-hidden="true" />
                        <span>{pipeline.name}</span>
                      </div>
                      <div className="pipe-cell">
                        <Chip tone={refTone(pipeline.providerType)}>{pipeline.ref}</Chip>
                      </div>
                      <div className="pipe-cell dim">{lastLabel}</div>
                      <div className="pipe-cell">
                        {linkTarget ? (
                          <button type="button" className="status-link" onClick={openRun}>
                            <StatusChip state={state === "idle" ? undefined : state} />
                            <span aria-hidden="true">→</span>
                          </button>
                        ) : (
                          <span className="text-fg-faint italic">never run</span>
                        )}
                      </div>
                      <div className="pipe-actions">
                        <Btn
                          variant="ghost"
                          icon={<History size={12} />}
                          onClick={() =>
                            navigate(
                              `/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}/history`
                            )
                          }
                        >
                          history
                        </Btn>
                        <Btn
                          variant="primary"
                          icon={<Play size={12} />}
                          onClick={() =>
                            navigate(
                              `/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}`
                            )
                          }
                        >
                          launch
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
