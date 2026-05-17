import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { pipelinesApi } from "../api/queries";
import type { VariableConfig } from "../../../server/src/types";
import { Crumb } from "../components/ui/crumb";
import { PageHead } from "../components/ui/page-head";
import { SectionHead } from "../components/ui/section-head";
import { Chip } from "../components/ui/chip";
import { Btn } from "../components/ui/btn";
import { VariableField } from "../components/ui/variable-field";

function kebab(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function PipelineLaunchPage() {
  const { projectId, pipelineName } = useParams();
  const { projects } = useAuth();
  const navigate = useNavigate();

  const project = projects?.find((p) => p.id === projectId);
  const pipeline = project?.pipelines.find((p) => p.name === pipelineName);

  const [vars, setVars] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    pipeline?.variables.forEach((v) => {
      initial[v.key] = v.value;
    });
    return initial;
  });

  const [isTriggering, setIsTriggering] = useState(false);

  if (!project || !pipeline) {
    return <div className="text-fg-mute italic">Pipeline not found.</div>;
  }

  const handleVarChange = (key: string, val: string) => {
    setVars((prev) => ({ ...prev, [key]: val }));
  };

  const onTrigger = async () => {
    setIsTriggering(true);
    try {
      const response = await pipelinesApi.trigger(project.id, pipeline.name, vars);
      toast.success("Pipeline triggered.");
      navigate(
        `/project/${encodeURIComponent(project.id)}/pipeline/${encodeURIComponent(pipeline.name)}/run/${response.id}`
      );
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401 || apiErr.status === 403) {
        toast.error("CI auth failed", {
          description:
            "The backend service account token is invalid, missing, or lacks permissions.",
          duration: 8000,
        });
      } else if (apiErr.status === 404) {
        toast.error("Project not found", {
          description:
            "Cannot find the project. Ensure the service account has the required access.",
          duration: 8000,
        });
      } else {
        toast.error("Failed to trigger pipeline", { description: apiErr.message });
      }
    } finally {
      setIsTriggering(false);
    }
  };

  const provider = (pipeline as unknown as { providerType?: string }).providerType ?? project.provider;

  return (
    <div>
      <Crumb onClick={() => navigate("/")}>Back to pipelines</Crumb>
      <PageHead
        kicker={
          <>
            <span>launch</span>
            <span>·</span>
            <span>{project.name}</span>
            <span>·</span>
            <span>provider: {provider}</span>
          </>
        }
        title={kebab(pipeline.name)}
        slashed
        sub={
          <>
            Configure parameters for ref{" "}
            <Chip tone="sky">{pipeline.ref}</Chip>. Locked values are injected server-side and never sent to the
            browser.
          </>
        }
      />

      <SectionHead color="amber">parameters</SectionHead>

      <div className="var-grid">
        {pipeline.variables.length === 0 ? (
          <p className="italic text-fg-mute">No variables configured for this pipeline.</p>
        ) : (
          pipeline.variables.map((vc: VariableConfig, idx: number) => (
            <VariableField
              key={vc.key}
              config={vc}
              value={vars[vc.key] ?? ""}
              onChange={(val) => handleVarChange(vc.key, val)}
              index={idx}
            />
          ))
        )}
      </div>

      <div className="action-row">
        <Btn
          variant="primary"
          size="lg"
          icon={<Play size={14} />}
          onClick={onTrigger}
          disabled={isTriggering}
        >
          {isTriggering ? "launching…" : "launch pipeline"}
        </Btn>
        <Btn variant="ghost" onClick={() => navigate("/")}>cancel</Btn>
      </div>
    </div>
  );
}
