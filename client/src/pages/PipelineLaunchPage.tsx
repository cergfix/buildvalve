import { useMemo, useState } from "react";
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

/**
 * Mirror of server-side needsSatisfied — keep in sync with
 * server/src/routes/pipelines.ts. ALL keys must match (AND); each value can be
 * a string or list (any-of).
 */
function needsSatisfied(
  cfg: VariableConfig,
  configs: VariableConfig[],
  vars: Record<string, string>
): boolean {
  if (!cfg.needs) return true;
  for (const [otherKey, expected] of Object.entries(cfg.needs)) {
    const otherCfg = configs.find((c) => c.key === otherKey);
    const actual = otherCfg?.locked
      ? otherCfg.value
      : (vars[otherKey] ?? otherCfg?.value ?? "");
    const expectedList = Array.isArray(expected) ? expected : [expected];
    if (!expectedList.includes(actual)) return false;
  }
  return true;
}

function kebab(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  const visibleVars = useMemo(() => {
    if (!pipeline) return [];
    return pipeline.variables.filter((vc) => needsSatisfied(vc, pipeline.variables, vars));
  }, [pipeline, vars]);

  /**
   * Auto-fit input width to the longest displayed value across the form so all
   * inputs share one comfortable width instead of stretching to the card edge.
   * The select trigger eats ~4 extra chars for the chevron icon + gap, so we
   * pad the budget accordingly to keep the visible content area aligned across
   * text inputs and selects. Considers default values, current user values, and
   * select/radio options.
   */
  const fieldWidthCh = useMemo(() => {
    let maxLen = 0;
    for (const vc of visibleVars) {
      const candidates = [vc.value ?? "", vars[vc.key] ?? "", ...(vc.options ?? [])];
      for (const c of candidates) {
        if (c.length > maxLen) maxLen = c.length;
      }
    }
    // Clamp: floor at 28ch, ceiling at 64ch. The +8 budget covers the select's
    // internal chevron (~4ch) plus generous horizontal padding so all controls
    // end at the same right edge.
    return Math.min(64, Math.max(28, maxLen + 8));
  }, [visibleVars, vars]);

  if (!project || !pipeline) {
    return <div className="text-fg-mute italic">Pipeline not found.</div>;
  }

  const handleVarChange = (key: string, val: string) => {
    setVars((prev) => ({ ...prev, [key]: val }));
  };

  const onTrigger = async () => {
    setIsTriggering(true);
    try {
      // Strip hidden (needs-unsatisfied) variables from the submitted payload —
      // the server drops them too, but sending them would cause an "Unknown variable"
      // error if the user changed the trigger key after typing into the dependent.
      const submittedVars: Record<string, string> = {};
      for (const vc of pipeline.variables) {
        if (needsSatisfied(vc, pipeline.variables, vars) && vars[vc.key] !== undefined) {
          submittedVars[vc.key] = vars[vc.key];
        }
      }
      const response = await pipelinesApi.trigger(project.id, pipeline.name, submittedVars);
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

  const provider =
    (pipeline as unknown as { providerType?: string }).providerType ??
    (project as unknown as { providerType?: string }).providerType ??
    project.provider;

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
          visibleVars.map((vc: VariableConfig, idx: number) => (
            <VariableField
              key={vc.key}
              config={vc}
              value={vars[vc.key] ?? ""}
              onChange={(val) => handleVarChange(vc.key, val)}
              index={idx}
              controlWidth={`${fieldWidthCh}ch`}
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
