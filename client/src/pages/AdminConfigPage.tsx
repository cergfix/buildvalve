import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/queries";
import { AlertCircle, FileJson, Loader2 } from "lucide-react";

export function AdminConfigPage() {
  const { data: config, isLoading, error } = useQuery({
    queryKey: ["adminConfig"],
    queryFn: () => adminApi.getConfig(),
    retry: false
  });

  return (
    <div className="w-full flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex-none mb-6 mt-2">
        <div className="border-b-[1.5px] border-slate-200 pb-4">
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2 mb-2">
            <FileJson size={28} className="text-primary" />
            Loaded `config.yml` Payload
          </h2>
          <p className="text-slate-500 mt-1">
            Active backend configuration. Settings are read-only and must be altered via server deployment.
            Sensitive tokens are automatically redacted via the API before transmission.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md border-[1.5px] border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center bg-white dark:bg-slate-900 p-6 text-slate-500 font-mono text-sm">
            <span className="flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading config...</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-red-500 bg-red-950/20 max-w-full">
            <AlertCircle size={48} className="mb-4 text-red-500" />
            <h3 className="text-xl font-bold mb-2">Access Denied</h3>
            <p className="max-w-md">You must be listed in the root `admins` array in the configuration file to view this section.</p>
          </div>
        ) : (
          <pre 
            className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap"
          >
            {JSON.stringify(config, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
