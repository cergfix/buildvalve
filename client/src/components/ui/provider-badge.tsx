import type { CIProviderType } from "../../api/types";

const providerInfo: Record<CIProviderType, { label: string; color: string }> = {
  gitlab: { label: "GitLab", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-700" },
  "github-actions": { label: "GitHub", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-600" },
  circleci: { label: "CircleCI", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-700" },
};

export function ProviderBadge({ type }: { type?: CIProviderType | string }) {
  const info = providerInfo[(type as CIProviderType)] ?? { label: type ?? "Unknown", color: "bg-slate-100 text-slate-600 border-slate-200" };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${info.color}`}>
      {info.label}
    </span>
  );
}
