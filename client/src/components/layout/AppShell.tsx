import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { pipelinesApi } from "../../api/queries";
import { GitBranch, Terminal, ExternalLink, User, Settings, LogOut } from "lucide-react";

interface NavItemProps {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  count?: number;
  end?: boolean;
}

function NavRow({ to, icon: Icon, label, count, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? "active" : ""}`}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <span className="nav-prefix">{isActive ? ">" : "·"}</span>
          <Icon size={14} className="shrink-0 opacity-80" />
          <span className="nav-label">{label}</span>
          {count != null ? <span className="nav-count">{count}</span> : null}
        </>
      )}
    </NavLink>
  );
}

export function AppShell() {
  const { user, logout, isLoading, isAdmin, externalLinks } = useAuth();
  const location = useLocation();

  const { data: recent, isError, isSuccess } = useQuery({
    queryKey: ["recentPipelines"],
    queryFn: pipelinesApi.getRecent,
    refetchInterval: 5000,
    enabled: !!user,
    retry: 2,
  });

  // The /api/pipelines/recent poll above doubles as a 5s heartbeat.
  // "connected" once it has ever succeeded; "reconnecting" if it last errored
  // (react-query keeps the previous data so we can still tell when it stops working);
  // "connecting" otherwise.
  const apiState: "connected" | "reconnecting" | "connecting" =
    isError ? "reconnecting" : isSuccess ? "connected" : "connecting";

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-fg-mute">
        <span className="status-dot" /> connecting…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const recentCount = recent?.reduce((n, p) => n + p.pipelines.length, 0) ?? 0;
  const onPipelinesArea = location.pathname === "/" || location.pathname.startsWith("/project/");

  return (
    <div className="app">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <span className="brand-dot" aria-hidden="true" />
            <span>BUILDVALVE</span>
            <span className="ver">v{__APP_VERSION__}</span>
          </div>

          <div className="nav-group">
            <div className="nav-heading">workspace</div>
            <NavLink
              to="/"
              end
              className={`nav-item ${onPipelinesArea ? "active" : ""}`}
            >
              <span className="nav-prefix">{onPipelinesArea ? ">" : "·"}</span>
              <GitBranch size={14} className="shrink-0 opacity-80" />
              <span className="nav-label">pipelines</span>
            </NavLink>
            <NavLink
              to="/recent-runs"
              end
              className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? "active" : ""}`}
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <span className="nav-prefix">{isActive ? ">" : "·"}</span>
                  <Terminal size={14} className="shrink-0 opacity-80" />
                  <span className="nav-label">recent runs</span>
                  {recentCount > 0 ? <span className="nav-count">{recentCount}</span> : null}
                </>
              )}
            </NavLink>
          </div>

          {externalLinks && externalLinks.length > 0 && (
            <div className="nav-group">
              <div className="nav-heading">external</div>
              {externalLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-item"
                >
                  <span className="nav-prefix">·</span>
                  <ExternalLink size={14} className="shrink-0 opacity-80" />
                  <span className="nav-label">{link.label}</span>
                  <span className="nav-ext">↗</span>
                </a>
              ))}
            </div>
          )}

          <div className="nav-group">
            <div className="nav-heading">account</div>
            <NavRow to="/profile" icon={User} label="profile" end />
            {isAdmin && <NavRow to="/admin" icon={Settings} label="admin settings" end />}
          </div>
        </div>

        <div className="sidebar-footer">
          <button onClick={logout} className="logout" type="button">
            <LogOut size={14} />
            <span>logout</span>
          </button>
          <div className="status-row">
            <span className="status-dot" data-state={apiState} aria-hidden="true" />
            <span>
              api:{" "}
              {apiState === "connected"
                ? "connected"
                : apiState === "reconnecting"
                ? "reconnecting…"
                : "connecting…"}
            </span>
          </div>
          <div>session: {user.email}</div>
          <div>build: v{__APP_VERSION__}</div>
          <div>&copy; {new Date().getFullYear()} BuildValve</div>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
