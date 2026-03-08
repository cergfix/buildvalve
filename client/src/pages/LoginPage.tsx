import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi, type ProviderInfo } from "../api/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { LogIn, AlertTriangle } from "lucide-react";

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    authApi.getProviders()
      .then(setProviders)
      .catch((err: unknown) => {
        console.error(err);
        setFetchError("Unable to load authentication providers. The server might be unreachable or misconfigured.");
      });
  }, []);

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex bg-slate-50 dark:bg-slate-900 h-screen w-full items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        <Card className="w-full shadow-blocky-strong shadow-primary border-2 border-primary mb-6">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-6xl font-black text-primary tracking-tight mb-2">BuildValve</CardTitle>
            <CardDescription className="text-base">Sign in to launch pipelines</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {fetchError ? (
              <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-md flex flex-col items-center text-center space-y-2">
                <AlertTriangle size={32} />
                <p className="text-sm font-medium">{fetchError}</p>
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center text-sm text-slate-500 bg-slate-100 p-4 rounded-md">
                No auth providers enabled. Please check server config.
              </div>
            ) : (
              providers.map((p) => (
                <Button
                  key={p.type}
                  className="w-full shadow-blocky flex items-center justify-center gap-2 text-md"
                  size="lg"
                  onClick={() => (window.location.href = p.loginUrl)}
                >
                  <LogIn size={20} />
                  Sign in with {p.label}
                </Button>
              ))
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
