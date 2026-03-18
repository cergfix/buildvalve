import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi, type ProviderInfo } from "../api/queries";
import { fetchApi } from "../api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { LogIn, AlertCircle } from "lucide-react";

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
      <div className="text-sm font-medium text-center text-muted-foreground">{provider.label}</div>
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />
      {error && (
        <div className="text-sm text-red-500 text-center">{error}</div>
      )}
      <Button
        type="submit"
        className="w-full shadow-blocky flex items-center justify-center gap-2 text-md"
        size="lg"
        disabled={submitting}
      >
        <LogIn size={20} />
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
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
    authApi.getProviders()
      .then(setProviders)
      .catch((err: unknown) => {
        console.error(err);
        setFetchError("Unable to load authentication providers. The server might be unreachable or misconfigured.");
      });
  }, []);

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
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
    <div className="flex bg-slate-50 dark:bg-slate-900 h-screen w-full items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        <Card className="w-full shadow-blocky-strong shadow-primary border-2 border-primary mb-6">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-6xl font-black text-primary tracking-tight mb-2">BuildValve</CardTitle>
            <CardDescription className="text-base">Sign in to launch pipelines</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {displayError && (
              <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-md flex flex-col items-center text-center space-y-2 mb-2 animate-in fade-in slide-in-from-top-1">
                <AlertCircle size={32} />
                <p className="text-sm font-medium">{displayError}</p>
              </div>
            )}

            {providers.length === 0 && !fetchError ? (
              <div className="text-center text-sm text-slate-500 bg-slate-100 p-4 rounded-md">
                No auth providers enabled. Please check server config.
              </div>
            ) : (
              <>
                {/* Always show form-based providers (like Local Login) at the top */}
                {formProviders.map((p) => (
                  <LocalLoginForm key={p.type} provider={p} />
                ))}

                {formProviders.length > 0 && oauthProviders.length > 0 && (
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                )}

                {/* Show OAuth/Button-based providers below */}
                <div className="space-y-3">
                  {oauthProviders.map((p) => (
                    <Button
                      key={p.type}
                      className="w-full shadow-blocky flex items-center justify-center gap-2 text-md"
                      size="lg"
                      onClick={() => (window.location.href = p.loginUrl)}
                    >
                      <LogIn size={20} />
                      {p.buttonLabel}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-slate-400 font-medium space-y-1">
          <p>BuildValve v{__APP_VERSION__}</p>
          <p>&copy; {new Date().getFullYear()} BuildValve contributors</p>
        </div>
      </div>
    </div>
  );
}
