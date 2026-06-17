import { Router } from "express";
import type { AppConfig, PipelineConfig, VariableConfig } from "../types/index.js";
import { getCIProvider } from "../services/ci/index.js";
import { CIProviderError } from "../services/ci/types.js";
import { isAuthorized, getAllowedProjectIds, isPipelineAuthorized } from "../services/permissions.js";
import { requireAuth } from "../middleware/requireAuth.js";
import type { TriggeredRunsStore } from "../services/triggered-runs/store.js";
import { LRUCache } from "lru-cache";
import { logger } from "../utils/logger.js";
import { access } from "../utils/access.js";

const recentPipelinesCache = new LRUCache<string, any>({
  max: 100,
  ttl: 1000 * 10, // 10 seconds
});

/** Test-only: clear the in-memory recent-pipelines cache. */
export function _resetRecentPipelinesCacheForTests() {
  recentPipelinesCache.clear();
}

export function createPipelineRouter(config: AppConfig, triggeredRuns?: TriggeredRunsStore): Router {
  const router = Router();

  router.use("/api/pipelines", requireAuth);

  // Get user's allowed pipeline configs
  router.get("/api/pipelines", (req, res) => {
    const user = req.session.user!;
    const allowedIds = getAllowedProjectIds(user, config);

    const projects = config.projects
      .filter((p) => allowedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        provider: p.provider,
        pipelines: p.pipelines
          .filter((pl) => isPipelineAuthorized(user, pl))
          .map((pl) => ({
            ...pl,
            // Resolved provider/type for this specific pipeline
            resolvedProvider: pl.provider || p.provider,
            resolvedExternalId: pl.external_id || p.external_id,
            providerType: config.ci_providers.find((cp) => cp.name === (pl.provider || p.provider))?.type,
          })),
      }));

    res.json(projects);
  });

  // Trigger a pipeline
  router.post("/api/pipelines/trigger", async (req, res) => {
    const user = req.session.user!;
    const { projectId, pipelineName, variables } = req.body as {
      projectId: string;
      pipelineName: string;
      variables?: Record<string, string>;
    };

    if (!projectId || !pipelineName) {
      res.status(400).json({ error: "projectId and pipelineName are required" });
      return;
    }

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found in config" });
      return;
    }

    const pipelineConfig = project.pipelines.find((p) => p.name === pipelineName);
    if (!pipelineConfig) {
      res.status(404).json({ error: "Pipeline not found in config" });
      return;
    }

    if (!isPipelineAuthorized(user, pipelineConfig)) {
      res.status(403).json({ error: "Not authorized for this pipeline" });
      return;
    }

    const provider = getCIProvider(pipelineConfig.provider || project.provider);
    if (!provider) {
      res.status(500).json({ error: `CI provider "${pipelineConfig.provider || project.provider}" not configured` });
      return;
    }

    const validationError = validateVariables(pipelineConfig, variables ?? {});
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const finalVars = buildFinalVariables(pipelineConfig.variables, variables ?? {});

    try {
      const pipeline = await provider.triggerPipeline(
        pipelineConfig.external_id || project.external_id,
        pipelineConfig.ref,
        finalVars,
        pipelineConfig.workflow_id
      );
      access(user, "pipeline_triggered", {
        project_id: projectId,
        provider: provider.type,
        pipeline_name: pipelineName,
        ci_pipeline_id: pipeline.id,
        variables: finalVars,
      });

      // Persist BV-triggered run so the history endpoint can filter to ours.
      if (triggeredRuns) {
        const variableMap: Record<string, string> = {};
        for (const v of finalVars) variableMap[v.key] = v.value;
        triggeredRuns
          .record({
            projectId,
            pipelineName,
            ref: pipelineConfig.ref,
            runId: pipeline.id,
            triggeredAt: Date.now(),
            triggeredByEmail: user.email,
            variables: variableMap,
          })
          .catch((err) =>
            logger.error("failed to record triggered run", { error: err, projectId, runId: pipeline.id })
          );
      }

      res.json(pipeline);
    } catch (err) {
      if (err instanceof CIProviderError) {
        access(user, "pipeline_trigger_failed", {
          project_id: projectId,
          provider: provider.type,
          pipeline_name: pipelineName,
          error_status: err.status,
          error_message: err.message,
        });
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: `${provider.type} API error`,
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // Recent pipeline runs for user's projects
  router.get("/api/pipelines/recent", async (req, res) => {
    const user = req.session.user!;
    const allowedIds = getAllowedProjectIds(user, config);
    const allowedProjects = config.projects.filter((p) => allowedIds.has(p.id));

    try {
      const results = await Promise.all(
        allowedProjects.map(async (project) => {
          // Collect all unique provider/externalId pairs for this project's pipelines
          const providerPairs = new Map<string, { providerName: string; externalId: string }>();

          // Add project-level default
          providerPairs.set(`${project.provider}:${project.external_id}`, {
            providerName: project.provider,
            externalId: project.external_id,
          });

          // Add pipeline-level overrides
          for (const pl of project.pipelines) {
            const pName = pl.provider || project.provider;
            const eId = pl.external_id || project.external_id;
            providerPairs.set(`${pName}:${eId}`, { providerName: pName, externalId: eId });
          }

          // Fetch from all providers in parallel
          const pipelinesArrays = await Promise.all(
            Array.from(providerPairs.values()).map(async ({ providerName, externalId }) => {
              const provider = getCIProvider(providerName);
              if (!provider) return [];

              const cacheKey = `${providerName}:${externalId}`;
              let cached = recentPipelinesCache.get(cacheKey);
              if (!cached) {
                cached = await provider.listPipelines(externalId, { per_page: 10 });
                recentPipelinesCache.set(cacheKey, cached);
              }
              return cached;
            })
          );

          // Flatten, deduplicate (if same ref/project on multiple providers? unlikely but possible), and sort
          const allPipelines = pipelinesArrays.flat().sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

          // Filter to BV-triggered runs and enrich with the triggering user
          // + variables. Matches /history's semantics — we don't want to
          // surface upstream runs that BuildValve had nothing to do with.
          // If the store is unavailable, fall back to the unfiltered list so
          // a transient DB hiccup doesn't blank the dashboard.
          let pipelines = allPipelines;
          if (triggeredRuns) {
            try {
              const ours = await triggeredRuns.listRecentByProject(project.id, 100);
              pipelines = allPipelines
                .filter((p) => ours.has(p.id))
                .map((p) => {
                  const meta = ours.get(p.id);
                  return {
                    ...p,
                    triggered_by: meta?.triggeredByEmail,
                    triggered_variables: meta?.variables,
                  };
                });
            } catch (storeErr) {
              logger.warn("triggered_runs filter failed; falling back to unfiltered recent", {
                error: storeErr,
              });
            }
          }

          return { projectId: project.id, projectName: project.name, pipelines: pipelines.slice(0, 15) };
        })
      );
      res.json(results);
    } catch (err) {
      if (err instanceof CIProviderError) {
        res.status(502).json({ error: "CI provider error", details: err.message });
        return;
      }
      throw err;
    }
  });

  // Pipeline execution history (filtered by ref)
  router.get("/api/pipelines/:projectId/history", async (req, res) => {
    const user = req.session.user!;
    const projectId = req.params.projectId;
    const ref = req.query.ref as string;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const provider = getCIProvider(project.provider);
    if (!provider) {
      res.status(500).json({ error: `CI provider "${project.provider}" not configured` });
      return;
    }

    try {
      const pipelines = await provider.listPipelines(project.external_id, { per_page: 50, ref });
      access(user, "pipeline_history_viewed", { project_id: projectId, ref });

      // When the triggered-runs store is wired in, filter to runs BuildValve
      // triggered, and enrich each row with the user who triggered + variables
      // submitted (so the "triggered by" / "version" columns have content).
      // If the store is unavailable, fall through to the unfiltered list so
      // we never silently hide everything.
      if (triggeredRuns) {
        try {
          const ours = await triggeredRuns.listRecent(projectId, ref, 50);
          const enriched = pipelines
            .filter((p) => ours.has(p.id))
            .map((p) => {
              const meta = ours.get(p.id);
              return {
                ...p,
                triggered_by: meta?.triggeredByEmail,
                triggered_variables: meta?.variables,
              };
            });
          res.json(enriched);
          return;
        } catch (storeErr) {
          logger.warn("triggered_runs filter failed; falling back to unfiltered history", {
            error: storeErr,
          });
        }
      }
      res.json(pipelines);
    } catch (err) {
      if (err instanceof CIProviderError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "CI provider error",
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // Single pipeline details
  router.get("/api/pipelines/:projectId/:pipelineId", async (req, res) => {
    const user = req.session.user!;
    const projectId = req.params.projectId;
    const pipelineId = req.params.pipelineId;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const provider = getCIProvider(project.provider);
    if (!provider) {
      res.status(500).json({ error: `CI provider "${project.provider}" not configured` });
      return;
    }

    try {
      const [pipeline, jobs] = await Promise.all([
        provider.getPipeline(project.external_id, pipelineId),
        provider.getPipelineJobs(project.external_id, pipelineId),
      ]);
      access(user, "pipeline_viewed", { project_id: projectId, pipeline_id: pipelineId });

      // Surface the variables this run was triggered with (when BuildValve
      // triggered it) so the run/logs pages can offer a one-click "relaunch
      // with the same parameters".
      let triggeredVariables: Record<string, string> | undefined;
      let triggeredPipelineName: string | undefined;
      if (triggeredRuns) {
        try {
          const ours = await triggeredRuns.listRecentByProject(projectId, 500);
          const meta = ours.get(pipelineId);
          if (meta) {
            triggeredVariables = meta.variables;
            triggeredPipelineName = meta.pipelineName;
          }
        } catch (storeErr) {
          logger.warn("failed to load triggered-run metadata for run detail", {
            error: storeErr,
            projectId,
            pipelineId,
          });
        }
      }

      res.json({
        pipeline,
        jobs,
        triggered_variables: triggeredVariables,
        triggered_pipeline_name: triggeredPipelineName,
      });
    } catch (err) {
      if (err instanceof CIProviderError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "CI provider error",
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // Cancel an in-flight pipeline run.
  router.post("/api/pipelines/:projectId/:pipelineId/cancel", async (req, res) => {
    const user = req.session.user!;
    const projectId = req.params.projectId;
    const pipelineId = req.params.pipelineId;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const provider = getCIProvider(project.provider);
    if (!provider) {
      res.status(500).json({ error: `CI provider "${project.provider}" not configured` });
      return;
    }

    try {
      await provider.cancelPipeline(project.external_id, pipelineId);
      access(user, "pipeline_canceled", {
        project_id: projectId,
        provider: provider.type,
        pipeline_id: pipelineId,
      });
      res.json({ canceled: true });
    } catch (err) {
      if (err instanceof CIProviderError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "CI provider error",
          details: err.message,
        });
        return;
      }
      throw err;
    }
  });

  // Get job trace logs
  router.get("/api/pipelines/:projectId/jobs/:jobId/trace", async (req, res) => {
    const user = req.session.user!;
    const projectId = req.params.projectId;
    const jobId = req.params.jobId;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const provider = getCIProvider(project.provider);
    if (!provider) {
      res.status(500).json({ error: `CI provider "${project.provider}" not configured` });
      return;
    }

    try {
      const trace = await provider.getJobTrace(project.external_id, jobId);
      access(user, "job_logs_viewed", { project_id: projectId, job_id: jobId });
      res.type("text/plain").send(trace);
    } catch (err) {
      if (err instanceof CIProviderError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "CI provider error",
          details: err.message,
        });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── SSE: stream pipeline status + jobs ──────────────────────────────────
  router.get("/api/pipelines/:projectId/:pipelineId/stream", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const projectId = req.params.projectId as string;
    const pipelineId = req.params.pipelineId as string;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const provider = getCIProvider(project.provider);
    if (!provider) { res.status(500).json({ error: "Provider not configured" }); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    });
    res.flushHeaders();

    let closed = false;
    req.on("close", () => { closed = true; });

    const TERMINAL = new Set(["success", "failed", "canceled"]);
    const INTERVAL = 3000;

    const poll = async () => {
      if (closed) return;
      try {
        const [pipeline, jobs] = await Promise.all([
          provider.getPipeline(project.external_id, pipelineId),
          provider.getPipelineJobs(project.external_id, pipelineId),
        ]);
        if (closed) return;
        res.write(`event: status\ndata: ${JSON.stringify({ pipeline, jobs })}\n\n`);

        if (TERMINAL.has(pipeline.status)) {
          res.write("event: done\ndata: {}\n\n");
          res.end();
          return;
        }
      } catch {
        if (closed) return;
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Failed to fetch pipeline status" })}\n\n`);
      }
      if (!closed) setTimeout(poll, INTERVAL);
    };

    poll();
  });

  // ── SSE: stream job trace logs ─────────────────────────────────────────
  router.get("/api/pipelines/:projectId/jobs/:jobId/trace/stream", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const projectId = req.params.projectId as string;
    const jobId = req.params.jobId as string;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    const project = config.projects.find((p) => p.id === projectId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const provider = getCIProvider(project.provider);
    if (!provider) { res.status(500).json({ error: "Provider not configured" }); return; }

    // We need a pipelineId to check job status — get it from query param
    const pipelineId = req.query.pipelineId as string | undefined;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;
    req.on("close", () => { closed = true; });

    const INTERVAL = 3000;
    let lastLength = 0;

    const poll = async () => {
      if (closed) return;
      try {
        const trace = await provider.getJobTrace(project.external_id, jobId);
        if (closed) return;

        // Only send if there's new content
        if (trace.length !== lastLength) {
          lastLength = trace.length;
          res.write(`event: logs\ndata: ${JSON.stringify({ logs: trace })}\n\n`);
        }

        // Check if the job is still running by querying pipeline jobs.
        // Only close on confirmed terminal states — anything else (running,
        // pending, or a provider-specific status we don't recognize yet)
        // keeps the stream open. This prevents premature closes when a
        // freshly-queued CircleCI job is in a transitional state we haven't
        // explicitly mapped.
        let jobDone = false;
        if (pipelineId) {
          try {
            const jobs = await provider.getPipelineJobs(project.external_id, pipelineId);
            const job = jobs.find((j) => j.id === jobId);
            if (job && ["success", "failed", "canceled"].includes(job.status)) {
              jobDone = true;
            }
          } catch { /* ignore — we'll keep polling */ }
        }

        if (jobDone) {
          // Send final logs and close
          res.write("event: done\ndata: {}\n\n");
          res.end();
          return;
        }
      } catch {
        if (closed) return;
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Failed to fetch logs" })}\n\n`);
      }
      if (!closed) setTimeout(poll, INTERVAL);
    };

    access(user, "job_logs_viewed", { project_id: projectId, job_id: jobId });
    poll();
  });

  return router;
}

/**
 * Returns true when a variable's `needs` conditions are satisfied by the
 * currently effective values. Used for both visibility (frontend filtering)
 * and gating server-side validation + outbound payload.
 *
 * Effective value = user-submitted value (when present) ?? config default.
 * Locked variables always use their config default since the user can't change them.
 *
 * `needs` is a map; ALL keys must match (logical AND). Each value can be a
 * single string (exact match) or an array (any-of). A variable with no `needs`
 * is always visible.
 */
function needsSatisfied(
  varConfig: VariableConfig,
  configs: VariableConfig[],
  userVars: Record<string, string>
): boolean {
  if (!varConfig.needs) return true;
  for (const [otherKey, expected] of Object.entries(varConfig.needs)) {
    const otherCfg = configs.find((c) => c.key === otherKey);
    const actual = otherCfg?.locked
      ? otherCfg.value
      : (userVars[otherKey] ?? otherCfg?.value ?? "");
    const expectedList = Array.isArray(expected) ? expected : [expected];
    if (!expectedList.includes(actual)) return false;
  }
  return true;
}

function validateVariables(
  pipelineConfig: PipelineConfig,
  userVars: Record<string, string>
): string | null {
  const configs = pipelineConfig.variables;

  for (const varConfig of configs) {
    const visible = needsSatisfied(varConfig, configs, userVars);

    if (varConfig.locked && varConfig.key in userVars && userVars[varConfig.key] !== varConfig.value) {
      return `Variable "${varConfig.key}" is locked and cannot be changed`;
    }

    // Validate select/radio values against allowed options (only when visible).
    if (visible && varConfig.options && varConfig.options.length > 0 && !varConfig.locked) {
      const value = userVars[varConfig.key] ?? varConfig.value;
      if (value && !varConfig.options.includes(value)) {
        return `Variable "${varConfig.key}" must be one of: ${varConfig.options.join(", ")}`;
      }
    }
  }

  const knownKeys = new Set(configs.map((v) => v.key));
  for (const key of Object.keys(userVars)) {
    if (!knownKeys.has(key)) {
      return `Unknown variable "${key}"`;
    }
  }

  return null;
}

function buildFinalVariables(
  varConfigs: VariableConfig[],
  userVars: Record<string, string>
): { key: string; value: string }[] {
  // Variables whose `needs` are unsatisfied are dropped entirely — the CI
  // provider never sees them.
  return varConfigs
    .filter((vc) => needsSatisfied(vc, varConfigs, userVars))
    .map((vc) => ({
      key: vc.key,
      value: vc.locked ? vc.value : (userVars[vc.key] ?? vc.value),
    }));
}
