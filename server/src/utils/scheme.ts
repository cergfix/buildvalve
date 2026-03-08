import type { AppConfig } from "../types/index.js";

/**
 * Returns true when the deployment serves plain HTTP (and therefore must skip
 * HSTS, upgrade-insecure-requests, and the session cookie's Secure flag).
 *
 * Decision order:
 *   1. `public_url` starts with `https://` → HTTPS.
 *   2. `public_url` starts with `http://` → plain HTTP.
 *   3. `public_url` present but no scheme (e.g. "host.example.com") → plain HTTP.
 *      (Pick a scheme explicitly — a bare host is ambiguous and we'd rather
 *      err on the side that lets cookies work than silently break login.)
 *   4. No `public_url` at all → HTTPS (production-safe default — production
 *      deployments are the most common case and they're behind TLS).
 *
 * `NODE_ENV=development` also forces plain-HTTP mode regardless of `public_url`
 * so that local dev with `npm run dev` doesn't get the production cookie /
 * HSTS treatment.
 */
export function isPlainHttp(config: AppConfig): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const url = config.public_url?.trim();
  if (!url) return false; // missing → HTTPS (prod default)
  if (/^https:\/\//i.test(url)) return false;
  return true; // http:// OR no scheme → plain HTTP
}
