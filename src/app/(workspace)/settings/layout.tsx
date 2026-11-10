import { SettingsTabs } from "./settings-tabs";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.organization.name}</p>
      </div>
      <SettingsTabs isOwner={ctx.role === "OWNER"} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
