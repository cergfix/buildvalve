import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { pipelinesApi } from "../api/queries";
import type { PipelineHistoryEntry } from "../api/types";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ArrowLeft, ExternalLink, Loader2, CheckCircle, XCircle } from "lucide-react";

export function PipelineHistoryPage() {
  const { projectId, pipelineName } = useParams();
  const navigate = useNavigate();
  const { projects } = useAuth();

  const project = projects?.find((p) => p.id === Number(projectId));
  const pipelineConfig = project?.pipelines.find((p) => p.name === pipelineName);

  const { data: history, isLoading, error } = useQuery({
    queryKey: ["pipelineHistory", projectId, pipelineConfig?.ref],
    queryFn: () => pipelinesApi.getHistory(Number(projectId), pipelineConfig!.ref),
    enabled: !!pipelineConfig,
    refetchInterval: 5000,
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

  if (!project || !pipelineConfig) {
    return <div className="p-8">Pipeline not found.</div>;
  }

  return (
    <div className="w-full space-y-6">
      <button 
        onClick={() => navigate("/")}
        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} className="mr-1" /> Back to Dashboard
      </button>

      <div className="space-y-4 pt-2">
        <div className="border-b-[1.5px] border-slate-200 dark:border-slate-700 pb-2 mb-4">
          <h3 className="text-3xl font-bold tracking-tight mb-1">{pipelineConfig.name} History</h3>
          <p className="text-slate-500">Execution history for ref: <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border-[1.5px] border-slate-200 dark:border-slate-700 text-sm">{pipelineConfig.ref}</code></p>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin inline-block mr-2" /> Loading history...</div>
        ) : error ? (
          <div className="p-8 text-red-500">Failed to load pipeline history.</div>
        ) : (
          <div className="rounded-md border-[1.5px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            {history?.length === 0 ? (
              <p className="p-6 text-sm italic text-slate-500">No execution history found for this pipeline.</p>
            ) : (
              <Table>
                <TableHeader className="">
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Execution Time</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.map((pipeline: PipelineHistoryEntry) => (
                    <TableRow key={pipeline.id}>
                      <TableCell className="font-semibold text-primary">
                        <a href={pipeline.web_url} target="_blank" rel="noreferrer" className="hover:underline flex items-center">
                          #{pipeline.id} <ExternalLink size={12} className="ml-1 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border-[1.5px] ${getStatusColor(pipeline.status)}`}>
                          <span className="flex items-center gap-1.5">{getStatusIcon(pipeline.status)} {pipeline.status}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {new Date(pipeline.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => navigate(`/project/${project.id}/pipeline/${encodeURIComponent(pipelineConfig.name)}/run/${pipeline.id}`)}
                          className="text-primary text-sm font-semibold hover:underline"
                        >
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
