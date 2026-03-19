import { Input } from "./input";
import { Label } from "./label";
import type { VariableConfig } from "../../../../server/src/types";

interface VariableFieldProps {
  config: VariableConfig;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function VariableField({ config, value, onChange, compact }: VariableFieldProps) {
  const isLocked = config.locked;
  const fieldType = config.type ?? "text";

  const lockedClass = compact
    ? "bg-slate-100 text-slate-500 shadow-none border-slate-200"
    : "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-300 disabled:opacity-100 shadow-none border-slate-200 dark:border-slate-700 h-8 text-xs max-w-sm";
  const normalClass = compact
    ? "shadow-sm border-slate-300"
    : "shadow-sm border-slate-300 dark:border-slate-600 h-8 text-xs max-w-sm";

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <Label className={compact ? "font-semibold" : "font-semibold text-sm"}>
        {config.key}
        {isLocked && <span className="text-red-500 text-[10px] font-normal ml-2 uppercase tracking-wide">(Locked)</span>}
      </Label>
      {config.description && <p className="text-xs text-slate-500">{config.description}</p>}

      {fieldType === "select" && config.options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLocked}
          className={`flex w-full rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${isLocked ? lockedClass : normalClass} ${compact ? "" : "max-w-sm h-8 text-xs"}`}
        >
          {!config.required && <option value="">— select —</option>}
          {config.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : fieldType === "radio" && config.options ? (
        <div className={`flex flex-wrap gap-3 ${compact ? "pt-1" : "pt-0.5"}`}>
          {config.options.map((opt) => (
            <label key={opt} className={`flex items-center gap-1.5 cursor-pointer ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input
                type="radio"
                name={config.key}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={isLocked}
                className="accent-primary h-3.5 w-3.5"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{opt}</span>
            </label>
          ))}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLocked}
          className={isLocked ? lockedClass : normalClass}
        />
      )}
    </div>
  );
}
