import { useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { pipelinesApi } from "../api/queries";
import type { CIJobDetail } from "../api/types";
import { ArrowLeft, Loader2, Terminal } from "lucide-react";

export function PipelineLogsPage() {
  const { projectId, pipelineName, runId, jobId } = useParams();
  const navigate = useNavigate();

  const { data: pipelineData } = useQuery({
    queryKey: ["pipelineRun", projectId, runId],
    queryFn: () => pipelinesApi.getPipeline(projectId!, runId!),
    refetchInterval: (query) => {
      const currentJobStatus = query.state.data?.jobs?.find((j: CIJobDetail) => j.id === jobId)?.status;
      if (currentJobStatus === "running" || currentJobStatus === "pending") return 3000;
      return false;
    }
  });

  const job = pipelineData?.jobs?.find((j: CIJobDetail) => j.id === jobId);
  const isRunning = job?.status === "running" || job?.status === "pending" || job?.status === "created";

  const { data: logs, isLoading: logsLoading, error } = useQuery({
    queryKey: ["jobTrace", projectId, jobId],
    queryFn: async () => {
      const res = await fetch(`/api/pipelines/${encodeURIComponent(projectId!)}/jobs/${encodeURIComponent(jobId!)}/trace`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.text();
    },
    refetchInterval: () => {
      if (isRunning) return 3000;
      return false;
    }
  });

  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex-none mb-4">
        <button
          onClick={() => navigate(`/project/${encodeURIComponent(projectId!)}/pipeline/${encodeURIComponent(pipelineName!)}/run/${runId}`)}
          className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-1" /> Back to Pipeline #{runId}
        </button>

        <div className="border-b-[1.5px] border-slate-200 pb-4">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Terminal size={24} className="text-primary" />
            Job Logs: {job?.name || `Job #${jobId}`}
            {isRunning && <Loader2 size={16} className="animate-spin text-blue-500 ml-2" />}
          </h2>
          <p className="text-slate-500 mt-1">
            Running in pipeline for {pipelineName}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md shadow-blocky border-[1.5px] border-slate-200 overflow-hidden flex flex-col">
        <pre
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-slate-950 text-slate-300 p-6 font-mono text-sm shadow-inner leading-relaxed whitespace-pre-wrap"
        >
          {logsLoading ? (
            <span className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={16} /> Fetching logs...</span>
          ) : error ? (
            <span className="text-red-400">Error loading logs.</span>
          ) : (
            logs || "No logs available."
          )}
        </pre>
      </div>
    </div>
  );
}
