import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/queries";
import type { DashboardData } from "../api/queries";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: DashboardData["user"] | null;
  projects: DashboardData["projects"] | null;
  isAdmin: boolean;
  externalLinks: DashboardData["externalLinks"];
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      setData(await authApi.getMe());
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setData(null);
      window.location.href = "/login";
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!data?.user,
        isLoading,
        user: data?.user || null,
        projects: data?.projects || null,
        isAdmin: data?.isAdmin || false,
        externalLinks: data?.externalLinks || [],
        checkAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
