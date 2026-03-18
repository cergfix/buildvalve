import { useState } from "react";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { GitBranch, User, Settings, LogOut, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

export function AppShell() {
  const { user, logout, isLoading, isAdmin, externalLinks } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (isLoading) {
    return <div className="flex h-screen w-full items-center justify-center text-slate-500"><svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const navItems = [
    { name: "Pipelines", to: "/", icon: GitBranch },
    { name: "Profile", to: "/profile", icon: User },
  ];

  if (isAdmin) {
    navItems.push({ name: "Admin Settings", to: "/admin", icon: Settings });
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Sidebar */}
      <div
        className={`relative border-r-[1.5px] border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-sm z-10 transition-all duration-300 ease-in-out ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-6 z-20 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-primary hover:border-primary shadow-sm transition-all"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        <div className="overflow-hidden">
          {/* Logo area */}
          <div className="h-[72px] flex items-center justify-center border-b-[1.5px] border-slate-100 dark:border-slate-800 px-5 overflow-hidden">
            {collapsed ? (
              <span className="text-2xl font-black tracking-tight text-primary select-none">B</span>
            ) : (
              <h1 className="text-4xl font-black tracking-tight text-primary whitespace-nowrap">BuildValve</h1>
            )}
          </div>

          {/* Nav items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item, index) => (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  title={collapsed ? item.name : undefined}
                  className={({ isActive }: { isActive: boolean }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all overflow-hidden ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-blocky"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`
                  }
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && (
                    <span className="whitespace-nowrap overflow-hidden">{item.name}</span>
                  )}
                </NavLink>

                {/* Separators and External Links Section (at index 0/Pipelines) */}
                {index === 0 && (
                  <>
                    <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
                    {externalLinks && externalLinks.length > 0 && (
                      <>
                        <div className="mt-1 mb-1 space-y-0.5">
                          {externalLinks.map((link) => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-all overflow-hidden"
                              title={collapsed ? link.label : undefined}
                            >
                              <ExternalLink size={18} className="shrink-0 opacity-70" />
                              {!collapsed && (
                                <span className="whitespace-nowrap overflow-hidden">{link.label}</span>
                              )}
                            </a>
                          ))}
                        </div>
                        <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom: logout + version */}
        <div className="p-3 border-t-[1.5px] border-slate-200 dark:border-slate-800 flex flex-col gap-3 overflow-hidden">
          <button
            onClick={logout}
            title={collapsed ? "Logout" : undefined}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400 transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">Logout</span>}
          </button>

          {!collapsed && (
            <div className="px-2 text-xs text-slate-400 dark:text-slate-500 space-y-1">
              <p>BuildValve v{__APP_VERSION__}</p>
              <p>&copy; {new Date().getFullYear()} BuildValve contributors</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto">
        <div className="p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
