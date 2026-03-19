import { useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLogStream } from "../hooks/useSSE";
import { ArrowLeft, Loader2, Terminal, Radio } from "lucide-react";

export function PipelineLogsPage() {
  const { projectId, pipelineName, runId, jobId } = useParams();
  const navigate = useNavigate();

  const { logs, isConnected, isDone } = useLogStream(projectId!, jobId!, runId);

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
            Job Logs: Job #{jobId}
            {!isDone && (
              isConnected
                ? <Radio size={14} className="text-green-500 ml-2" />
                : <Loader2 size={16} className="animate-spin text-blue-500 ml-2" />
            )}
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
          {!logs && !isDone ? (
            <span className="flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={16} /> Fetching logs...</span>
          ) : (
            logs || "No logs available."
          )}
        </pre>
      </div>
    </div>
  );
}
