import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Crumb } from "../components/ui/crumb";
import { PageHead } from "../components/ui/page-head";
import { SectionHead } from "../components/ui/section-head";
import { Chip } from "../components/ui/chip";

export function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div>
      <Crumb onClick={() => navigate("/")}>Back to pipelines</Crumb>

      <PageHead
        kicker={
          <>
            <span>account</span>
            <span>·</span>
            <span>profile</span>
          </>
        }
        title="profile"
        slashed
        sub="Your account details, as provided by your SSO."
      />

      <SectionHead color="violet">identity</SectionHead>

      <div className="box has-accent" data-accent="violet" style={{ maxWidth: 720 }}>
        <div className="box-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div className="stat-label">email</div>
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-fg-mute" />
              <span className="font-medium">{user.email}</span>
            </div>
          </div>

          <div>
            <div className="stat-label">provider</div>
            <Chip tone="violet" uppercase>
              {String(user.provider).toUpperCase()}
            </Chip>
          </div>

          <div>
            <div className="stat-label">groups</div>
            {user.groups && user.groups.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {user.groups.map((g) => (
                  <Chip key={g} tone="sky">
                    {g}
                  </Chip>
                ))}
              </div>
            ) : (
              <span className="text-fg-mute italic text-[12px]">No groups available in SAML assertion</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
