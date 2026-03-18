import { useState } from "react";
import { pipelinesApi } from "../../api/queries";
import type { PipelineConfig, VariableConfig } from "../../../../server/src/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Play } from "lucide-react";
import { toast } from "sonner";

interface PipelineCardProps {
  projectId: string;
  pipeline: PipelineConfig;
}

export function PipelineCard({ projectId, pipeline }: PipelineCardProps) {
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    pipeline.variables.forEach(v => {
      initial[v.key] = v.value;
    });
    return initial;
  });
  const [isTriggering, setIsTriggering] = useState(false);

  const handleVarChange = (key: string, val: string) => {
    setVars(prev => ({ ...prev, [key]: val }));
  };

  const onTrigger = async () => {
    setIsTriggering(true);
    try {
      const response = await pipelinesApi.trigger(projectId, pipeline.name, vars);
      toast.success("Pipeline triggered!", { description: `Pipeline #${response.id} is now running.` });
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401 || apiErr.status === 403) {
        toast.error("CI Auth Failed", {
          description: "The backend service account token is invalid, missing, or lacks permissions.",
          duration: 8000
        });
      } else if (apiErr.status === 404) {
        toast.error("Project Not Found", {
          description: "Cannot find the project. Ensure the service account has the required access.",
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
    <Card className="flex flex-col shadow-blocky hover:shadow-blocky-strong transition-all h-full">
      <CardHeader className="bg-slate-50 border-b-[1.5px] border-slate-200">
        <CardTitle>{pipeline.name}</CardTitle>
        <CardDescription>Ref: <code>{pipeline.ref}</code></CardDescription>
      </CardHeader>

      <CardContent className="flex-1 p-4 space-y-4">
        {pipeline.variables.length === 0 ? (
          <p className="text-sm text-slate-500 italic mt-2">No variables configured.</p>
        ) : (
          pipeline.variables.map((vc: VariableConfig) => (
            <div key={vc.key} className="space-y-1">
              <Label className="font-semibold">{vc.key}</Label>
              {vc.description && <p className="text-xs text-slate-500 mb-1">{vc.description}</p>}
              <Input
                value={vars[vc.key] ?? ""}
                onChange={(e) => handleVarChange(vc.key, e.target.value)}
                disabled={vc.locked}
                className={vc.locked ? "bg-slate-100 text-slate-500 shadow-none border-slate-200" : "shadow-sm border-slate-300"}
              />
            </div>
          ))
        )}
      </CardContent>

      <CardFooter className="p-4 border-t-[1.5px] border-slate-200 bg-slate-50 mt-auto">
        <Button
          className="w-full shadow-blocky hover:-translate-y-[1px] font-bold tracking-wide"
          onClick={onTrigger}
          disabled={isTriggering}
        >
          <Play size={16} className="mr-2" fill="currentColor" />
          {isTriggering ? "Triggering..." : "Launch Pipeline"}
        </Button>
      </CardFooter>
    </Card>
  );
}
