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
import { cardWidthPx } from "../components/ui/variable-field-width";

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
   * One shared card width per nesting level so cards at the same level line up.
   * Each level's width is the max its members need (compact minimum, grown to
   * fit the longest key). Computed from ALL variables of that level — not just
   * the visible ones — so a level's width is stable as `needs`-gated cards
   * appear/disappear, and level 0 never resizes when level 1 toggles.
   */
  const levelWidths = useMemo(() => {
    const widths = { 0: 0, 1: 0 };
    for (const vc of pipeline?.variables ?? []) {
      const level = vc.needs && Object.keys(vc.needs).length > 0 ? 1 : 0;
      widths[level] = Math.max(widths[level], cardWidthPx(vc.key, !!vc.locked));
    }
    return widths;
  }, [pipeline]);

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
          visibleVars.map((vc: VariableConfig) => {
            // index = position in the original config.variables array, not in
            // the filtered visible list. This keeps each field's badge number
            // and accent color stable as `needs`-gated variables appear/disappear.
            const configIndex = pipeline.variables.findIndex((v) => v.key === vc.key);
            const level = vc.needs && Object.keys(vc.needs).length > 0 ? 1 : 0;
            return (
              <VariableField
                key={vc.key}
                config={vc}
                value={vars[vc.key] ?? ""}
                onChange={(val) => handleVarChange(vc.key, val)}
                index={configIndex}
                width={levelWidths[level]}
              />
            );
          })
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
