import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi, type ProviderInfo } from "../api/queries";
import { fetchApi, API_BASE } from "../api/client";
import { LogIn, AlertCircle } from "lucide-react";
import { Btn } from "../components/ui/btn";

function LocalLoginForm({ provider }: { provider: ProviderInfo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await fetchApi(provider.loginUrl, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.location.href = "/";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-fg-mute text-center">{provider.label}</div>
      <input
        className="var-input"
        type="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <input
        className="var-input"
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />
      {error && <div className="text-rose text-[11px] text-center">{error}</div>}
      <Btn type="submit" variant="primary" size="lg" icon={<LogIn size={14} />} disabled={submitting} className="w-full">
        {submitting ? "signing in…" : "sign in"}
      </Btn>
    </form>
  );
}

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const urlError = searchParams.get("error");

  useEffect(() => {
    authApi
      .getProviders()
      .then(setProviders)
      .catch((err: unknown) => {
        console.error(err);
        setFetchError(
          "Unable to load authentication providers. The server might be unreachable or misconfigured."
        );
      });
  }, []);

  if (isLoading) return <div className="flex h-screen items-center justify-center text-fg-mute">Loading…</div>;
  if (isAuthenticated && !urlError) return <Navigate to="/" replace />;

  const oauthProviders = providers.filter((p) => !p.form);
  const formProviders = providers.filter((p) => p.form === "credentials");

  const getErrorMessage = (code: string | null) => {
    switch (code) {
      case "access_denied":
        return "Access denied. Your account does not have permission to access BuildValve. Please contact an administrator.";
      case "oauth_denied":
        return "Login was cancelled or denied by the provider.";
      case "session_error":
        return "A session error occurred. Please try again.";
      case "oauth_error":
        return "An error occurred during authentication with the provider.";
      case "saml_error":
        return "SAML authentication failed.";
      case "no_user":
        return "No user profile was returned by the provider.";
      default:
        return code ? `Authentication error: ${code}` : null;
    }
  };

  const displayError = urlError ? getErrorMessage(urlError) : fetchError;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-bg text-fg">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="brand mb-6" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <span className="brand-dot" aria-hidden="true" />
          <span>BUILDVALVE</span>
          <span className="ver">v{__APP_VERSION__}</span>
        </div>

        <div className="box has-accent w-full" data-accent="emerald">
          <div className="box-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="text-center">
              <h1 className="page-title" style={{ fontSize: 32 }}>
                <span className="slash">/</span>
                login
              </h1>
              <p className="text-fg-mute text-[12px] mt-2">Sign in to launch pipelines</p>
            </div>

            {displayError && (
              <div className="box has-accent" data-accent="rose">
                <div className="box-body flex flex-col items-center text-center gap-2">
                  <AlertCircle size={20} className="text-rose" />
                  <p className="text-[12px] text-fg">{displayError}</p>
                </div>
              </div>
            )}

            {providers.length === 0 && !fetchError ? (
              <div className="text-center text-[12px] text-fg-mute italic">
                No auth providers enabled. Check server config.
              </div>
            ) : (
              <>
                {formProviders.map((p) => (
                  <LocalLoginForm key={p.type} provider={p} />
                ))}

                {formProviders.length > 0 && oauthProviders.length > 0 && (
                  <div className="text-center text-[10px] uppercase tracking-[0.14em] text-fg-mute">— or —</div>
                )}

                <div className="flex flex-col gap-2">
                  {oauthProviders.map((p) => (
                    <Btn
                      key={p.type}
                      variant="default"
                      size="lg"
                      icon={<LogIn size={14} />}
                      onClick={() => (window.location.href = `${API_BASE}${p.loginUrl}`)}
                      className="w-full"
                    >
                      {p.buttonLabel}
                    </Btn>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="text-center text-[10px] text-fg-faint mt-6 space-y-1">
          <p>&copy; {new Date().getFullYear()} BuildValve contributors</p>
        </div>
      </div>
    </div>
  );
}
