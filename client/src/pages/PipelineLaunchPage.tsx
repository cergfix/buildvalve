import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { pipelinesApi } from "../api/queries";

import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Play, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { VariableConfig } from "../../../server/src/types";

export function PipelineLaunchPage() {
  const { projectId, pipelineName } = useParams();
  const { projects } = useAuth();
  const navigate = useNavigate();

  const project = projects?.find((p) => p.id === Number(projectId));
  const pipeline = project?.pipelines.find((p) => p.name === pipelineName);

  const [vars, setVars] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    pipeline?.variables.forEach(v => {
      initial[v.key] = v.value;
    });
    return initial;
  });
  
  const [isTriggering, setIsTriggering] = useState(false);

  if (!project || !pipeline) {
    return <div className="p-8">Pipeline not found.</div>;
  }

  const handleVarChange = (key: string, val: string) => {
    setVars(prev => ({ ...prev, [key]: val }));
  };

  const onTrigger = async () => {
    setIsTriggering(true);
    try {
      const response = await pipelinesApi.trigger(project.id, pipeline.name, vars);
      toast.success("Pipeline triggered successfully!");
      navigate(`/project/${project.id}/pipeline/${encodeURIComponent(pipeline.name)}/run/${response.id}`);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401 || apiErr.status === 403) {
        toast.error("GitLab Auth Failed", { 
          description: "The backend service account token is invalid, missing, or lacks permissions.",
          duration: 8000
        });
      } else if (apiErr.status === 404) {
        toast.error("GitLab Project Not Found", { 
          description: "Cannot find the project. Ensure the Service Account has 'Developer' access.",
          duration: 8000
        });
      } else {
        toast.error("Failed to trigger pipeline", { description: apiErr.message });
      }
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <button 
        onClick={() => navigate("/")}
        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} className="mr-1" /> Back to Dashboard
      </button>

      <div className="space-y-6 pt-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{pipeline.name}</h2>
          <p className="text-sm text-slate-500">
            Configure parameters for ref: <code>{pipeline.ref}</code>
          </p>
        </div>
        
        <div className="space-y-4 max-w-2xl">
          {pipeline.variables.length === 0 ? (
            <p className="text-slate-500 italic text-sm">No variables configured for this pipeline.</p>
          ) : (
            pipeline.variables.map((vc: VariableConfig) => (
              <div key={vc.key} className="space-y-1.5">
                <Label className="font-semibold text-sm">
                  {vc.key} 
                  {vc.locked && <span className="text-red-500 text-[10px] font-normal ml-2 uppercase tracking-wide">(Locked)</span>}
                </Label>
                {vc.description && <p className="text-xs text-slate-500">{vc.description}</p>}
                <Input
                  value={vars[vc.key] ?? ""}
                  onChange={(e) => handleVarChange(vc.key, e.target.value)}
                  disabled={vc.locked}
                  className={vc.locked ? "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-300 disabled:opacity-100 shadow-none border-slate-200 dark:border-slate-700 h-8 text-xs max-w-sm" : "shadow-sm border-slate-300 dark:border-slate-600 h-8 text-xs max-w-sm"}
                />
              </div>
            ))
          )}
        </div>

        <div className="flex justify-start pt-2">
          <Button 
            className="font-bold text-xs px-3" 
            size="sm"
            onClick={onTrigger}
            disabled={isTriggering}
          >
            <Play size={14} className="mr-1 inline-block" />
            {isTriggering ? "Executing..." : "Launch"}
          </Button>
        </div>
      </div>
    </div>
  );
}
