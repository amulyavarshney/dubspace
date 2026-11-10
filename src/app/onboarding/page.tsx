import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { getOrgContext, requireSessionUser } from "@/server/auth/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireSessionUser();
  const ctx = await getOrgContext(user.id);
  const { new: isNew } = await searchParams;
  if (ctx && !isNew) redirect("/projects");
  return (
    <div className="flex min-h-screen flex-col items-center px-4 pt-10 pb-16">
      <Logo href={ctx ? "/projects" : "/onboarding"} />
      <div className="mt-20 w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{ctx ? "Create another organization" : `Welcome, ${user.name.split(" ")[0]}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx ? "Organizations keep projects, members and provider credentials fully separated." : "Create an organization to start managing dubbing projects. You can invite editors and voice actors afterwards."}
        </p>
        <OnboardingForm hasExisting={!!ctx} />
      </div>
    </div>
  );
}
