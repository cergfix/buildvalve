import type { CIProvider, CIPipeline, CIJob, CIProviderType } from "./types.js";
import { logger } from "../../utils/logger.js";

// Shared in-memory state
const pipelinesDB = new Map<string, CIPipeline>();
const jobsDB = new Map<string, CIJob[]>();
let nextId = 1000;

export class MockCIProvider implements CIProvider {
  readonly type: CIProviderType;
  readonly name: string;

  constructor(name: string, type: CIProviderType) {
    this.name = name;
    this.type = type;
    logger.info(`Mock CI Provider initialized: ${name} (${type})`);
  }

  async triggerPipeline(
    projectId: string,
    ref: string,
    variables: { key: string; value: string }[],
    workflowId?: string
  ): Promise<CIPipeline> {
    const id = String(nextId++);

    const pipeline: CIPipeline = {
      id,
      provider: this.type,
      project_id: projectId,
      status: "running",
      ref,
      sha: "mock-sha-abcdef",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      web_url: this.buildWebUrl(projectId, id),
    };

    const jobs: CIJob[] = [
      {
        id: String(nextId++),
        name: "build",
        stage: "build",
        status: "success",
        created_at: new Date().toISOString(),
        started_at: new Date(Date.now() - 30000).toISOString(),
        finished_at: new Date(Date.now() - 15000).toISOString(),
        duration: 15,
        web_url: this.buildJobWebUrl(projectId, String(nextId - 1)),
      },
      {
        id: String(nextId++),
        name: "deploy",
        stage: "deploy",
        status: "running",
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: null,
        duration: null,
        web_url: this.buildJobWebUrl(projectId, String(nextId - 1)),
      },
    ];

    pipelinesDB.set(id, pipeline);
    jobsDB.set(id, jobs);

    // Simulate pipeline finishing after 15 seconds
    setTimeout(() => {
      pipeline.status = "success";
      pipeline.updated_at = new Date().toISOString();
      const deployJob = jobs.find((j) => j.name === "deploy")!;
      deployJob.status = "success";
      deployJob.finished_at = new Date().toISOString();
      pipelinesDB.set(id, pipeline);
      jobsDB.set(id, jobs);
      logger.info(`Mock Pipeline ${id} (${this.type}) finished successfully`);
    }, 15000);

    return pipeline;
  }

  async listPipelines(
    projectId: string,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<CIPipeline[]> {
    const list = Array.from(pipelinesDB.values())
      .filter((p) => p.project_id === projectId && p.provider === this.type);
    return list.reverse();
  }

  async getPipeline(projectId: string, pipelineId: string): Promise<CIPipeline> {
    const p = pipelinesDB.get(pipelineId);
    if (!p) throw new Error("Mock pipeline not found");
    return p;
  }

  async getPipelineJobs(projectId: string, pipelineId: string): Promise<CIJob[]> {
    return jobsDB.get(pipelineId) || [];
  }

  async getJobTrace(projectId: string, jobId: string): Promise<string> {
    let logs = `Mock ${this.type} runner starting...\n`;
    logs += `Fetching repository for project ${projectId}...\n`;
    logs += `Resolving dependencies...\n`;
    logs += `Running job script for job #${jobId}...\n\n`;

    let isRunning = false;
    for (const jobs of jobsDB.values()) {
      const job = jobs.find((j) => j.id === jobId);
      if (job && (job.status === "running" || job.status === "pending")) {
        isRunning = true;
      }
    }

    if (isRunning) {
      logs += `Wait, the mock job is still running... [${new Date().toISOString()}]\n`;
    } else {
      logs += `Job completed successfully.\n`;
    }

    return logs;
  }

  private buildWebUrl(projectId: string, pipelineId: string): string {
    switch (this.type) {
      case "gitlab":
        return `http://mock-gitlab.local/${projectId}/-/pipelines/${pipelineId}`;
      case "github-actions":
        return `https://github.com/${projectId}/actions/runs/${pipelineId}`;
      case "circleci":
        return `https://app.circleci.com/pipelines/${projectId}/${pipelineId}`;
    }
  }

  private buildJobWebUrl(projectId: string, jobId: string): string {
    switch (this.type) {
      case "gitlab":
        return `http://mock-gitlab.local/${projectId}/-/jobs/${jobId}`;
      case "github-actions":
        return `https://github.com/${projectId}/actions/runs/0/jobs/${jobId}`;
      case "circleci":
        return `https://app.circleci.com/pipelines/${projectId}/jobs/${jobId}`;
    }
  }
}
