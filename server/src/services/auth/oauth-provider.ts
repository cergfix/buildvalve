import type { Router, Request, Response } from "express";
import type { AuthProvider } from "./types.js";
import type { AuthUser, OAuthProviderConfig, AppConfig } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { audit } from "../../utils/audit.js";

function getRedirectUrl(req: Request, path: string): string {
  const corsOrigin = process.env.CORS_ORIGIN;
  // If CORS_ORIGIN is a full URL (like http://localhost:5173), use it as the base
  if (corsOrigin && corsOrigin.startsWith("http")) {
    const origin = corsOrigin.replace(/\/+$/, "");
    return `${origin}${path.startsWith("/") ? path : "/" + path}`;
  }
  return path;
}

interface OAuthEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scopes: string;
}

const ENDPOINTS: Record<string, OAuthEndpoints> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    scopes: "user:email",
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: "email profile",
  },
  gitlab: {
    authorizeUrl: "{base}/oauth/authorize",
    tokenUrl: "{base}/oauth/token",
    userUrl: "{base}/api/v4/user",
    scopes: "read_user",
  },
};

function resolveEndpoints(type: string, baseUrl?: string): OAuthEndpoints {
  const ep = ENDPOINTS[type];
  if (!ep) throw new Error(`Unknown OAuth provider type: ${type}`);

  if (type === "gitlab") {
    const base = (baseUrl ?? "https://gitlab.com").replace(/\/+$/, "");
    return {
      authorizeUrl: ep.authorizeUrl.replace("{base}", base),
      tokenUrl: ep.tokenUrl.replace("{base}", base),
      userUrl: ep.userUrl.replace("{base}", base),
      scopes: ep.scopes,
    };
  }
  return ep;
}

export class OAuthProvider implements AuthProvider {
  type: string;
  label: string;
  private config: OAuthProviderConfig;
  private appConfig: AppConfig;
  private endpoints: OAuthEndpoints;

  constructor(providerConfig: OAuthProviderConfig, appConfig: AppConfig) {
    this.type = providerConfig.type;
    this.label = providerConfig.label;
    this.config = providerConfig;
    this.appConfig = appConfig;
    this.endpoints = resolveEndpoints(
      providerConfig.type,
      providerConfig.base_url,
    );
  }

  setupRoutes(router: Router): void {
    const prefix = `/api/auth/${this.type}`;

    // Step 1: redirect to OAuth provider
    router.get(`${prefix}/login`, (req: Request, res: Response) => {
      const callbackUrl = this.config.callback_url ?? `${req.protocol}://${req.get("host")}${prefix}/callback`;

      const params = new URLSearchParams({
        client_id: this.config.client_id,
        redirect_uri: callbackUrl,
        scope: this.config.scopes ?? this.endpoints.scopes,
        response_type: "code",
        state: req.session.id,
      });

      // Google requires access_type for refresh tokens
      if (this.type === "google") {
        params.set("access_type", "online");
      }

      res.redirect(`${this.endpoints.authorizeUrl}?${params.toString()}`);
    });

    // Step 2: handle callback with authorization code
    router.get(`${prefix}/callback`, async (req: Request, res: Response) => {
      const { code, error } = req.query;

      if (error || !code) {
        logger.error(`OAuth ${this.type} callback error`, { error });
        return res.redirect(getRedirectUrl(req, "/login?error=oauth_denied"));
      }

      try {
        const callbackUrl = this.config.callback_url ?? `${req.protocol}://${req.get("host")}${prefix}/callback`;
        const accessToken = await this.exchangeCode(code as string, callbackUrl);
        const user = await this.fetchUser(accessToken);

        // Check permissions
        const hasAccess = this.appConfig.permissions.some((rule) => {
          if (rule.users?.includes(user.email)) return true;
          if (rule.groups && user.groups) {
            return rule.groups.some((g) => user.groups!.includes(g));
          }
          return false;
        });

        if (!hasAccess) {
          audit(user, "login_failed", { reason: "access_denied" });
          return res.redirect(getRedirectUrl(req, "/login?error=access_denied"));
        }

        req.session.user = user;
        req.session.save((err) => {
          if (err) {
            logger.error(`OAuth ${this.type} session save error`, { error: err });
            return res.redirect(getRedirectUrl(req, "/login?error=session_error"));
          }
          audit(user, "login");
          return res.redirect(getRedirectUrl(req, "/"));
        });
      } catch (err) {
        logger.error(`OAuth ${this.type} authentication failed`, { error: (err as Error).message });
        return res.redirect(getRedirectUrl(req, "/login?error=oauth_error"));
      }
    });
  }

  private async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const body: Record<string, string> = {
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      code,
      redirect_uri: redirectUri,
    };

    // GitHub doesn't use grant_type; Google and GitLab do
    if (this.type !== "github") {
      body.grant_type = "authorization_code";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    const resp = await fetch(this.endpoints.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed (${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;

    if (data.error) {
      throw new Error(`Token exchange error: ${data.error}`);
    }

    return data.access_token as string;
  }

  private async fetchUser(accessToken: string): Promise<AuthUser> {
    const resp = await fetch(this.endpoints.userUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      throw new Error(`User info fetch failed (${resp.status})`);
    }

    const data = (await resp.json()) as Record<string, unknown>;

    switch (this.type) {
      case "github":
        return this.extractGitHubUser(data, accessToken);
      case "google":
        return this.extractGoogleUser(data);
      case "gitlab":
        return this.extractGitLabUser(data);
      default:
        throw new Error(`No user extractor for ${this.type}`);
    }
  }

  private async extractGitHubUser(data: Record<string, unknown>, accessToken: string): Promise<AuthUser> {
    let email = data.email as string | null;

    // GitHub may not return email in profile; fetch from emails endpoint
    if (!email) {
      const resp = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (resp.ok) {
        const emails = (await resp.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified);
        email = primary?.email ?? emails[0]?.email ?? null;
      }
    }

    return {
      email: email ?? "",
      provider: "github",
      groups: [],
    };
  }

  private extractGoogleUser(data: Record<string, unknown>): AuthUser {
    return {
      email: (data.email as string) ?? "",
      provider: "google",
      groups: [],
    };
  }

  private extractGitLabUser(data: Record<string, unknown>): AuthUser {
    return {
      email: (data.email as string) ?? "",
      provider: "gitlab",
      groups: [],
    };
  }
}
