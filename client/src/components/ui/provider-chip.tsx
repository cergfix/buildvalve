import type { CIProviderType } from "../../api/types";
import { Chip, type ChipTone } from "./chip";

const providerToTone: Record<string, { label: string; tone: ChipTone }> = {
  gitlab: { label: "gitlab", tone: "amber" },
  "github-actions": { label: "github", tone: "violet" },
  github: { label: "github", tone: "violet" },
  circleci: { label: "circleci", tone: "emerald" },
};

export function ProviderChip({ type }: { type?: CIProviderType | string }) {
  const info = providerToTone[String(type ?? "")] ?? { label: type ?? "unknown", tone: "muted" as ChipTone };
  return (
    <Chip tone={info.tone} uppercase>
      {info.label}
    </Chip>
  );
}
