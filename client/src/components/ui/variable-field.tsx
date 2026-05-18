import type { VariableConfig } from "../../../../server/src/types";
import { TechSelect } from "./tech-select";

type Accent = "emerald" | "amber" | "violet" | "sky";
const ACCENT_CYCLE: Accent[] = ["emerald", "amber", "violet", "sky"];

interface VariableFieldProps {
  config: VariableConfig;
  value: string;
  onChange: (value: string) => void;
  index: number;
  /** Optional inline width applied to the input/select control (e.g. "24ch"). */
  controlWidth?: string;
}

export function VariableField({ config, value, onChange, index, controlWidth }: VariableFieldProps) {
  const accent = ACCENT_CYCLE[index % ACCENT_CYCLE.length];
  const isLocked = config.locked;
  const fieldType = config.type ?? "text";

  return (
    <div className="var-field" data-accent={accent}>
      <div className="var-num">{String(index + 1).padStart(2, "0")}</div>
      <div className="var-key">
        <span>{config.key}</span>
        {isLocked && <span className="var-locked">locked</span>}
        {!isLocked && config.required && <span className="var-required">required</span>}
      </div>
      {isLocked ? (
        <div className="var-desc">
          Locked by config. Set automatically based on target ref.
        </div>
      ) : (
        config.description && <div className="var-desc">{config.description}</div>
      )}

      {fieldType === "select" && config.options ? (
        <div style={controlWidth ? { width: controlWidth, maxWidth: "100%" } : undefined}>
          <TechSelect
            value={value}
            onChange={onChange}
            options={config.options}
            accent={accent}
            disabled={isLocked}
            allowEmpty={!config.required}
          />
        </div>
      ) : fieldType === "radio" && config.options ? (
        <div className="var-options">
          {config.options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`var-pill ${value === opt ? "selected" : ""}`}
              disabled={isLocked}
              onClick={() => onChange(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <input
          className="var-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLocked}
          placeholder=""
          style={controlWidth ? { width: controlWidth, maxWidth: "100%" } : undefined}
        />
      )}
    </div>
  );
}
