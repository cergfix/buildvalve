import * as React from "react";
import { ChevronDown, Check } from "lucide-react";

type Accent = "emerald" | "amber" | "violet" | "sky" | "rose";

interface TechSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  accent?: Accent;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
}

export function TechSelect({
  value,
  onChange,
  options,
  accent = "emerald",
  placeholder = "select",
  disabled,
  allowEmpty,
}: TechSelectProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = React.useState(-1);

  const items = React.useMemo(
    () => (allowEmpty ? ["", ...options] : options),
    [options, allowEmpty]
  );

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < items.length) {
          onChange(items[focusIndex]);
          setOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, items, focusIndex, onChange]);

  const display = value === "" || value == null ? (
    <span className="select-value muted">{placeholder}</span>
  ) : (
    <span className="select-value">{value}</span>
  );

  return (
    <div className="select" data-accent={accent} data-open={open ? "true" : "false"} ref={ref}>
      <button
        type="button"
        className="select-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setFocusIndex(items.findIndex((it) => it === value));
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {display}
        <span className="select-caret">
          <ChevronDown size={14} />
        </span>
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {items.map((opt, i) => {
            const selected = opt === value;
            const focused = i === focusIndex;
            const label = opt === "" ? <em className="muted">— none —</em> : opt;
            return (
              <button
                key={opt || `__empty_${i}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={`select-option ${selected ? "selected" : ""}`}
                style={focused && !selected ? { background: "var(--_accent-dim)", color: "var(--_accent)" } : undefined}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                <span className="select-mark">{selected ? "▸" : ""}</span>
                <span className="select-label">{label}</span>
                {selected ? <Check size={12} className="check" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
