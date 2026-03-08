import type { AuthProvider } from "./types.js";

const providers = new Map<string, AuthProvider>();

export function registerProvider(provider: AuthProvider): void {
  providers.set(provider.type, provider);
}

export function getProvider(type: string): AuthProvider | undefined {
  return providers.get(type);
}

export function getAllProviders(): AuthProvider[] {
  return Array.from(providers.values());
}
