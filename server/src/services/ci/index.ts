import type { CIProvider } from "./types.js";

const providers = new Map<string, CIProvider>();

export function registerCIProvider(provider: CIProvider): void {
  providers.set(provider.name, provider);
}

export function getCIProvider(name: string): CIProvider | undefined {
  return providers.get(name);
}

export function getAllCIProviders(): CIProvider[] {
  return Array.from(providers.values());
}

export function clearCIProviders(): void {
  providers.clear();
}
