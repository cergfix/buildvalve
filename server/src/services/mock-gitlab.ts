import { GitLabService } from "./gitlab.js";
import type { GitLabPipeline, GitLabJob } from "../types/index.js";
import { logger } from "../utils/logger.js";

// In-memory state to simulate running pipelines
const pipelinesDB = new Map<number, GitLabPipeline>();
const jobsDB = new Map<number, GitLabJob[]>();

// Counter for IDs
let nextId = 1000;

export class MockGitLabService extends GitLabService {
  constructor() {
    super("http://mock-gitlab.local", "mock-token");
    logger.info("Initializing Mock GitLab Service (Dev Mode)");
  }

  async triggerPipeline(
    projectId: number,
    ref: string,
    variables: { key: string; value: string }[]
  ): Promise<GitLabPipeline> {
    const id = nextId++;
    
    const pipeline: GitLabPipeline = {
      id,
      iid: id,
      project_id: projectId,
      status: "running",
      ref,
      sha: "mock-sha-abcdef",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      web_url: `http://mock-gitlab.local/${projectId}/-/pipelines/${id}`,
      source: "api"
    };

    const jobs: GitLabJob[] = [
      {
        id: nextId++,
        name: "build",
        stage: "build",
        status: "success",
        created_at: new Date().toISOString(),
        started_at: new Date(Date.now() - 30000).toISOString(),
        finished_at: new Date(Date.now() - 15000).toISOString(),
        duration: 15,
        web_url: `http://mock-gitlab.local/${projectId}/-/jobs/${nextId - 1}`
      },
      {
        id: nextId++,
        name: "deploy",
        stage: "deploy",
        status: "running",
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: null,
        duration: null,
        web_url: `http://mock-gitlab.local/${projectId}/-/jobs/${nextId - 1}`
      }
    ];

    pipelinesDB.set(id, pipeline);
    jobsDB.set(id, jobs);

    // Simulate pipeline finishing after 15 seconds
    setTimeout(() => {
      pipeline.status = "success";
      pipeline.updated_at = new Date().toISOString();
      const deployJob = jobs.find(j => j.name === "deploy")!;
      deployJob.status = "success";
      deployJob.finished_at = new Date().toISOString();
      pipelinesDB.set(id, pipeline);
      jobsDB.set(id, jobs);
      logger.info(`Mock Pipeline ${id} finished successfully`);
    }, 15000);

    return pipeline;
  }

  async listPipelines(
    projectId: number,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<GitLabPipeline[]> {
    // Return all pipelines created for this project in reverse order
    const list = Array.from(pipelinesDB.values()).filter(p => p.project_id === projectId);
    return list.reverse();
  }

  async getPipeline(projectId: number, pipelineId: number): Promise<GitLabPipeline> {
    const p = pipelinesDB.get(pipelineId);
    if (!p) throw new Error("Mock pipeline not found");
    return p;
  }

  async getPipelineJobs(projectId: number, pipelineId: number): Promise<GitLabJob[]> {
    return jobsDB.get(pipelineId) || [];
  }

  async getJobTrace(projectId: number, jobId: number): Promise<string> {
    let logs = `Mock GitLab Runner starting...\n`;
    logs += `Fetching repository for project ${projectId}...\n`;
    logs += `Resolving dependencies...\n`;
    logs += `Running job script for job #${jobId}...\n\n`;
    
    // figure out if it's currently running
    let isRunning = false;
    for (const jobs of jobsDB.values()) {
      const job = jobs.find(j => j.id === jobId);
      if (job && (job.status === "running" || job.status === "pending" || job.status === "created")) {
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
}
