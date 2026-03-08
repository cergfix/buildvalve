import type { Router } from "express";
import type { AuthUser } from "../../types/index.js";

export interface AuthProvider {
  type: string;
  label: string;
  setupRoutes(router: Router): void;
}

export type AuthCallback = (err: Error | null, user: AuthUser | null) => void;
