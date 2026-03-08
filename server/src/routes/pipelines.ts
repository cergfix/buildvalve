import { Router } from "express";
import type { AppConfig, PipelineConfig, VariableConfig } from "../types/index.js";
import { GitLabService, GitLabApiError } from "../services/gitlab.js";
import { isAuthorized, getAllowedProjectIds } from "../services/permissions.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { LRUCache } from "lru-cache";
import { logger } from "../utils/logger.js";

const recentPipelinesCache = new LRUCache<number, any>({
  max: 100,
  ttl: 1000 * 10, // 10 seconds
});

export function createPipelineRouter(config: AppConfig, gitlab: GitLabService): Router {
  const router = Router();

  router.use(requireAuth);

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
        pipelines: p.pipelines,
      }));

    res.json(projects);
  });

  // Trigger a pipeline
  router.post("/api/pipelines/trigger", async (req, res) => {
    const user = req.session.user!;
    const { projectId, pipelineName, variables } = req.body as {
      projectId: number;
      pipelineName: string;
      variables?: Record<string, string>;
    };

    if (!projectId || !pipelineName) {
      res.status(400).json({ error: "projectId and pipelineName are required" });
      return;
    }

    // Check permission
    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    // Find project and pipeline config
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

    // Validate variables
    const validationError = validateVariables(pipelineConfig, variables ?? {});
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    // Build final variables: config defaults merged with user values
    const finalVars = buildFinalVariables(pipelineConfig.variables, variables ?? {});

    try {
      const pipeline = await gitlab.triggerPipeline(projectId, pipelineConfig.ref, finalVars);
      logger.info({
        event: "pipeline_triggered",
        user_email: user.email,
        project_id: projectId,
        pipeline_name: pipelineName,
        gitlab_pipeline_id: pipeline.id,
        variables: finalVars
      });
      res.json(pipeline);
    } catch (err) {
      if (err instanceof GitLabApiError) {
        console.error(
          `GitLab error triggering pipeline: project=${projectId} pipeline="${pipelineName}" status=${err.status}`
        );
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "GitLab API error",
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
    const configuredIds = config.projects.filter((p) => allowedIds.has(p.id)).map((p) => p.id);

    try {
      const results = await Promise.all(
        configuredIds.map(async (projectId) => {
          const project = config.projects.find((p) => p.id === projectId)!;
          let pipelines = recentPipelinesCache.get(projectId);
          if (!pipelines) {
            pipelines = await gitlab.listPipelines(projectId, { per_page: 10 });
            recentPipelinesCache.set(projectId, pipelines);
          }
          return { projectId, projectName: project.name, pipelines };
        })
      );
      res.json(results);
    } catch (err) {
      if (err instanceof GitLabApiError) {
        res.status(502).json({ error: "GitLab API error", details: err.message });
        return;
      }
      throw err;
    }
  });

  // Pipeline execution history (filtered by ref)
  router.get("/api/pipelines/:projectId/history", async (req, res) => {
    const user = req.session.user!;
    const projectId = Number(req.params.projectId);
    const ref = req.query.ref as string;

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    try {
      // Fetch up to 50 pipelines for this project and ref
      const pipelines = await gitlab.listPipelines(projectId, { per_page: 50, ref });
      res.json(pipelines);
    } catch (err) {
      if (err instanceof GitLabApiError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "GitLab API error",
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
    const projectId = Number(req.params.projectId);
    const pipelineId = Number(req.params.pipelineId);

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    try {
      const [pipeline, jobs] = await Promise.all([
        gitlab.getPipeline(projectId, pipelineId),
        gitlab.getPipelineJobs(projectId, pipelineId),
      ]);
      res.json({ pipeline, jobs });
    } catch (err) {
      if (err instanceof GitLabApiError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "GitLab API error",
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
    const projectId = Number(req.params.projectId);
    const jobId = Number(req.params.jobId);

    if (!isAuthorized(user, projectId, config)) {
      res.status(403).json({ error: "Not authorized for this project" });
      return;
    }

    try {
      const trace = await gitlab.getJobTrace(projectId, jobId);
      res.type("text/plain").send(trace);
    } catch (err) {
      if (err instanceof GitLabApiError) {
        res.status(err.status >= 500 ? 502 : err.status).json({
          error: "GitLab API error",
          details: err.message,
        });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

function validateVariables(
  pipelineConfig: PipelineConfig,
  userVars: Record<string, string>
): string | null {
  for (const varConfig of pipelineConfig.variables) {
    // Check locked variables aren't being overridden
    if (varConfig.locked && varConfig.key in userVars && userVars[varConfig.key] !== varConfig.value) {
      return `Variable "${varConfig.key}" is locked and cannot be changed`;
    }

    // Check required variables are provided
    if (varConfig.required && !varConfig.locked) {
      const value = userVars[varConfig.key] ?? varConfig.value;
      if (!value) {
        return `Variable "${varConfig.key}" is required`;
      }
    }
  }

  // Check for unknown variables
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
