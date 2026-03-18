import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { pipelinesApi } from "../api/queries";
import type { CIJobDetail } from "../api/types";

import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ArrowLeft, ExternalLink, Loader2, CheckCircle, XCircle, Terminal } from "lucide-react";

export function PipelineRunPage() {
  const { projectId, pipelineName, runId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["pipelineRun", projectId, runId],
    queryFn: () => pipelinesApi.getPipeline(projectId!, runId!),
    refetchInterval: (query) => {
      const status = query.state.data?.pipeline?.status;
      if (status === "success" || status === "failed" || status === "canceled") return false;
      return 3000;
    }
  });

  const getStatusIcon = (status: string) => {
    switch(status) {
      case "success": return <CheckCircle className="text-green-500" size={16} />;
      case "failed": return <XCircle className="text-red-500" size={16} />;
      case "running":
      case "pending": return <Loader2 className="text-blue-500 animate-spin" size={16} />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "success": return "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700";
      case "failed":  return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700";
      case "running": return "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700";
      default:        return "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    }
  };

  if (isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (error || !data) return <div className="p-8 text-red-500">Error loading pipeline run</div>;

  const { pipeline, jobs } = data;

  return (
    <div className="w-full space-y-6">
      <button
        onClick={() => navigate("/")}
        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} className="mr-1" /> Back to Pipelines
      </button>

      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">
             Run <a href={pipeline.web_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">#{pipeline.id} <ExternalLink size={20} className="inline opacity-50" /></a>
          </h2>
          <p className="text-slate-500 text-lg">Launched: {pipelineName} on <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border-[1.5px] border-slate-200 dark:border-slate-700">{pipeline.ref}</code></p>
        </div>
        <Badge className={`px-4 py-1.5 text-sm uppercase font-bold tracking-widest border-[1.5px] ${getStatusColor(pipeline.status)}`}>
           <span className="flex items-center gap-2">{getStatusIcon(pipeline.status)} {pipeline.status}</span>
        </Badge>
      </div>

      <div className="space-y-4 pt-4">
        <div className="border-b-[1.5px] border-slate-200 dark:border-slate-700 pb-2 mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">Pipeline Jobs & Logs</h3>
          <p className="text-slate-500 mt-1">Live status of the ongoing CI/CD stages</p>
        </div>

        <div className="rounded-md border-[1.5px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          {jobs.length === 0 ? (
            <p className="p-6 text-sm italic text-slate-500">No jobs found or pipeline hasn't started yet.</p>
          ) : (
            <Table>
              <TableHeader className="">
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Job Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Logs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job: CIJobDetail) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium text-slate-600 dark:text-slate-400 uppercase text-xs tracking-wider">{job.stage}</TableCell>
                    <TableCell className="font-semibold">{job.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-[1.5px] ${getStatusColor(job.status)}`}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {job.started_at && job.finished_at
                        ? `${Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s`
                        : (job.started_at ? "Running..." : "-")}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => navigate(`/project/${encodeURIComponent(projectId!)}/pipeline/${encodeURIComponent(pipelineName!)}/run/${runId}/job/${job.id}/logs`)}
                        className="text-primary text-sm font-semibold hover:underline flex items-center justify-end gap-1 w-full"
                      >
                        <Terminal size={14} /> View Logs
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {pipeline.status === "running" && (
        <div className="flex items-center gap-2 text-slate-500 text-sm italic w-full justify-center">
          <Loader2 size={14} className="animate-spin" />
          Live updating...
        </div>
      )}
    </div>
  );
}
