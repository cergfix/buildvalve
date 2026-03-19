import { Router } from "express";
import type { AppConfig, PipelineConfig, VariableConfig } from "../types/index.js";
import { getCIProvider } from "../services/ci/index.js";
import { CIProviderError } from "../services/ci/types.js";
import { isAuthorized, getAllowedProjectIds, isPipelineAuthorized } from "../services/permissions.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { LRUCache } from "lru-cache";
import { logger } from "../utils/logger.js";
import { audit } from "../utils/audit.js";

const recentPipelinesCache = new LRUCache<string, any>({
  max: 100,
  ttl: 1000 * 10, // 10 seconds
});

export function createPipelineRouter(config: AppConfig): Router {
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
        providerType: config.ci_providers.find((cp) => cp.name === p.provider)?.type,
        pipelines: p.pipelines.filter((pl) => isPipelineAuthorized(user, pl)),
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

    const provider = getCIProvider(project.provider);
    if (!provider) {
      res.status(500).json({ error: `CI provider "${project.provider}" not configured` });
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
        project.external_id,
        pipelineConfig.ref,
        finalVars,
        pipelineConfig.workflow_id
      );
      audit(user, "pipeline_triggered", {
        project_id: projectId,
        provider: provider.type,
        pipeline_name: pipelineName,
        ci_pipeline_id: pipeline.id,
        variables: finalVars,
      });
      res.json(pipeline);
    } catch (err) {
      if (err instanceof CIProviderError) {
        audit(user, "pipeline_trigger_failed", {
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
          const provider = getCIProvider(project.provider);
          if (!provider) return { projectId: project.id, projectName: project.name, pipelines: [] };

          let pipelines = recentPipelinesCache.get(project.id);
          if (!pipelines) {
            pipelines = await provider.listPipelines(project.external_id, { per_page: 10 });
            recentPipelinesCache.set(project.id, pipelines);
          }
          return { projectId: project.id, projectName: project.name, pipelines };
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
      audit(user, "pipeline_history_viewed", { project_id: projectId, ref });
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
      audit(user, "pipeline_viewed", { project_id: projectId, pipeline_id: pipelineId });
      res.json({ pipeline, jobs });
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
      audit(user, "job_logs_viewed", { project_id: projectId, job_id: jobId });
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

        // Check if the job is still running by querying pipeline jobs
        let jobDone = false;
        if (pipelineId) {
          try {
            const jobs = await provider.getPipelineJobs(project.external_id, pipelineId);
            const job = jobs.find((j) => j.id === jobId);
            if (job && !["running", "pending", "created"].includes(job.status)) {
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

    audit(user, "job_logs_viewed", { project_id: projectId, job_id: jobId });
    poll();
  });

  return router;
}

function validateVariables(
  pipelineConfig: PipelineConfig,
  userVars: Record<string, string>
): string | null {
  for (const varConfig of pipelineConfig.variables) {
    if (varConfig.locked && varConfig.key in userVars && userVars[varConfig.key] !== varConfig.value) {
      return `Variable "${varConfig.key}" is locked and cannot be changed`;
    }

    if (varConfig.required && !varConfig.locked) {
      const value = userVars[varConfig.key] ?? varConfig.value;
      if (!value) {
        return `Variable "${varConfig.key}" is required`;
      }
    }
  }

  const knownKeys = new Set(pipelineConfig.variables.map((v) => v.key));
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
  return varConfigs.map((vc) => ({
    key: vc.key,
    value: vc.locked ? vc.value : (userVars[vc.key] ?? vc.value),
  }));
}
