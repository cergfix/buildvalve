import { useAuth } from "../contexts/AuthContext";
import { Mail, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark",  label: "Dark",  icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ThemeSwitcher() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // next-themes sets theme only after mount to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const isActive = theme === value;
          return (
            <button
              key={value}
              id={`theme-${value}`}
              onClick={() => setTheme(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border-[1.5px] transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-blocky"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>
      {theme === "system" && (
        <p className="text-xs text-slate-500 italic">
          System currently resolved to <strong>{resolvedTheme}</strong> mode based on your browser's preference.
        </p>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1 pt-2">
        <h2 className="text-3xl font-bold tracking-tight">My Profile</h2>
        <p className="text-slate-500 text-sm">Your details and preferences.</p>
      </div>

      <div className="space-y-8 pt-4 max-w-2xl">
        <div className="space-y-5">
          <div className="border-b-[1.5px] border-slate-200 dark:border-slate-700 pb-2">
            <h3 className="text-xl font-bold">Identity Information</h3>
            <p className="text-slate-500 mt-1 text-sm">Your details provided by {user.provider.toUpperCase()} SSO</p>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email Address</h4>
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-md border-[1.5px] border-slate-200 dark:border-slate-700 max-w-sm">
                <Mail className="text-slate-400 shrink-0" size={18} />
                <span className="font-medium">{user.email}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Groups</h4>
              <div className="flex flex-wrap gap-2">
                {user.groups && user.groups.length > 0 ? (
                  <span className="font-medium text-slate-700 dark:text-slate-300">{user.groups.join(", ")}</span>
                ) : (
                  <span className="text-slate-500 italic">No groups available in SAML assertion</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 pt-4">
          <div className="border-b-[1.5px] border-slate-200 dark:border-slate-700 pb-2">
            <h3 className="text-xl font-bold">Appearance</h3>
            <p className="text-slate-500 mt-1 text-sm">Choose how BuildValve looks to you. Your preference is saved locally.</p>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Theme</h4>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}
