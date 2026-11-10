import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";
import { listProviderConfigs } from "@/server/services/ai-providers";
import { ProviderSettings } from "./provider-settings";

export const metadata: Metadata = { title: "AI providers" };

export default async function AIProvidersPage() {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  if (ctx.role !== "OWNER") redirect("/settings/organization");
  const providers = await listProviderConfigs(user.id, ctx.organization.id);
  return <ProviderSettings initial={providers} />;
}
