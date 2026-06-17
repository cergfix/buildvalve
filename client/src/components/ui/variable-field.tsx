import type { VariableConfig } from "../../../../server/src/types";
import { TechSelect } from "./tech-select";

type Accent = "emerald" | "amber" | "violet" | "sky";
const ACCENT_CYCLE: Accent[] = ["emerald", "amber", "violet", "sky"];

// Per-card width budget. A card has a compact MIN width (sized so the 300px
// control has equal grey margin on both sides) and grows only to fit its own
// (non-wrapping) key — so a long variable name targets that name. The page
// resolves one shared width per nesting level (see PipelineLaunchPage) and
// passes it in, so cards at the same level line up; cardWidthPx is also the
// standalone fallback when no width is supplied.
const MIN_CARD_PX = 404; // 300px control + 52px left gutter + matching 52px on the right
const CHROME_PX = 70; // 52px badge gutter + 18px right padding
const KEY_CHAR_PX = 8.6; // approx advance of an uppercase key glyph at 13px + letter-spacing
const LOCKED_CHIP_PX = 66; // LOCKED chip width + gap, present only on locked vars

export function cardWidthPx(key: string, locked: boolean): number {
  const keyWidth = key.length * KEY_CHAR_PX + (locked ? LOCKED_CHIP_PX : 0);
  return Math.max(MIN_CARD_PX, Math.round(CHROME_PX + keyWidth));
}

interface VariableFieldProps {
  config: VariableConfig;
  value: string;
  onChange: (value: string) => void;
  index: number;
  /** Shared width (px) for this card's nesting level; falls back to own key. */
  width?: number;
}

export function VariableField({ config, value, onChange, index, width }: VariableFieldProps) {
  const accent = ACCENT_CYCLE[index % ACCENT_CYCLE.length];
  const isLocked = config.locked;
  const fieldType = config.type ?? "text";
  const isNested = !!config.needs && Object.keys(config.needs).length > 0;

  return (
    <div
      className="var-field"
      data-accent={accent}
      data-nested={isNested ? "true" : undefined}
      style={{ width: width ?? cardWidthPx(config.key, isLocked), maxWidth: "100%" }}
    >
      <div className="var-num">{String(index + 1).padStart(2, "0")}</div>
      <div className="var-key">
        <span>{config.key}</span>
        {isLocked && <span className="var-locked">locked</span>}
      </div>
      {isLocked ? (
        <div className="var-desc">
          Locked by config. Set automatically based on target ref.
        </div>
      ) : (
        config.description && <div className="var-desc">{config.description}</div>
      )}

      {fieldType === "select" && config.options ? (
        <div className="var-control">
          <TechSelect
            value={value}
            onChange={onChange}
            options={config.options.filter((o) => o !== "")}
            accent={accent}
            disabled={isLocked}
            allowEmpty={config.options.includes("")}
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
          className="var-input var-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLocked}
          placeholder=""
        />
      )}
    </div>
  );
}
