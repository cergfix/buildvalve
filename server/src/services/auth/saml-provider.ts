import type { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as SamlStrategy } from "@node-saml/passport-saml";
import type { Profile, SamlConfig } from "@node-saml/passport-saml";
import type { AuthProvider } from "./types.js";
import type { AuthUser, SamlProviderConfig, AppConfig } from "../../types/index.js";

export class SamlProvider implements AuthProvider {
  type = "saml";
  label: string;
  private strategy: SamlStrategy;
  private config: SamlProviderConfig;
  private appConfig: AppConfig;

  constructor(providerConfig: SamlProviderConfig, appConfig: AppConfig) {
    this.label = providerConfig.label;
    this.config = providerConfig;
    this.appConfig = appConfig;

    const samlConfig: SamlConfig = {
      entryPoint: providerConfig.entry_point,
      issuer: providerConfig.issuer,
      callbackUrl: providerConfig.callback_url,
      idpCert: providerConfig.cert.trim(),
      wantAuthnResponseSigned: true,
      wantAssertionsSigned: false,
    };

    this.strategy = new SamlStrategy(
      samlConfig,
      // Sign-on verify
      (profile: Profile | null | undefined, done: (err: Error | null, user?: Record<string, unknown>) => void) => {
        if (!profile) {
          return done(new Error("No SAML profile returned"));
        }
        const user = this.extractUser(profile);
        return done(null, user as unknown as Record<string, unknown>);
      },
      // Logout verify
      (_profile: Profile | null | undefined, done: (err: Error | null, user?: Record<string, unknown>) => void) => {
        return done(null);
      }
    );

    passport.use("saml", this.strategy as unknown as passport.Strategy);
  }

  private extractUser(profile: Profile): AuthUser {
    const mapping = this.config.attribute_mapping;

    const rawEmail = this.getAttr(profile, mapping.email);
    const email = (Array.isArray(rawEmail) ? rawEmail[0] : rawEmail) ?? profile.nameID ?? "";

    let groups: string[] | undefined;
    if (mapping.groups) {
      const raw = this.getAttr(profile, mapping.groups);
      if (raw) {
        groups = Array.isArray(raw) ? raw : [raw];
      }
    }

    return { email, provider: "saml", groups };
  }

  private getAttr(profile: Profile, key: string): string | string[] | undefined {
    const record = profile as unknown as Record<string, unknown>;
    const val = record[key];
    if (val !== undefined) return val as string | string[];

    const attrs = record["attributes"] as Record<string, unknown> | undefined;
    if (attrs) {
      const attrVal = attrs[key];
      if (attrVal !== undefined) return attrVal as string | string[];
    }

    return undefined;
  }

  setupRoutes(router: Router): void {
    // Login: redirect to IdP
    router.get("/api/auth/saml/login", (req: Request, res: Response, next) => {
      passport.authenticate("saml", {
        session: false,
      })(req, res, next);
    });

    // ACS callback: receive assertion
    router.post("/api/auth/saml/callback", (req: Request, res: Response, next) => {
      passport.authenticate(
        "saml",
        { session: false },
        (err: Error | null, user: AuthUser | false) => {
          if (err) {
            console.error("SAML auth error:", err.message);
            return res.redirect("/login?error=saml_error");
          }
          if (!user) {
            return res.redirect("/login?error=no_user");
          }

          // Check if user has any permissions at all
          const hasAnyAccess = this.appConfig.permissions.some((rule) => {
            if (rule.users?.includes(user.email)) return true;
            if (rule.groups && user.groups) {
              return rule.groups.some((g) => user.groups!.includes(g));
            }
            return false;
          });

          if (!hasAnyAccess) {
            return res.redirect("/login?error=access_denied");
          }

          req.session.user = user;
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
              return res.redirect("/login?error=session_error");
            }
            return res.redirect("/");
          });
        }
      )(req, res, next);
    });

    // SP metadata for IdP configuration
    router.get("/api/auth/saml/metadata", (_req: Request, res: Response) => {
      const metadata = this.strategy.generateServiceProviderMetadata(null, null);
      res.set("Content-Type", "application/xml");
      res.send(metadata);
    });
  }
}
