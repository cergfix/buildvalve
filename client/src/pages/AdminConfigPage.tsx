import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { adminApi } from "../api/queries";
import { Crumb } from "../components/ui/crumb";
import { PageHead } from "../components/ui/page-head";
import { SectionHead } from "../components/ui/section-head";

export function AdminConfigPage() {
  const navigate = useNavigate();
  const { data: config, isLoading, error } = useQuery({
    queryKey: ["adminConfig"],
    queryFn: () => adminApi.getConfig(),
    retry: false,
  });

  return (
    <div>
      <Crumb onClick={() => navigate("/")}>Back to pipelines</Crumb>

      <PageHead
        kicker={
          <>
            <span>account</span>
            <span>·</span>
            <span>admin</span>
          </>
        }
        title="admin"
        slashed
        sub="Active backend configuration. Read-only — alter via server deployment. Sensitive tokens are redacted server-side."
      />

      <SectionHead color="amber">config.yml</SectionHead>

      <div className="terminal">
        <div className="terminal-head">
          <div className="dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="label">config.yml · loaded</div>
        </div>
        <div className="terminal-body">
          {isLoading ? (
            <span className="text-fg-mute italic flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> loading config…
            </span>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-rose">
              <AlertCircle size={32} />
              <h3 className="text-fg text-base font-semibold">Access denied</h3>
              <p className="text-fg-mid text-[12px] max-w-md">
                You must be listed in the root <code className="text-violet">admins</code> array in the configuration
                file to view this section.
              </p>
            </div>
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-words">{JSON.stringify(config, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
