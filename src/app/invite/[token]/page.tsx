import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { getSessionUser } from "@/server/auth/session";
import { getInvitationByToken } from "@/server/services/organizations";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const inv = await getInvitationByToken(token);
  const problem = !inv ? "This invitation link is not valid." : inv.acceptedAt ? "This invitation has already been used." : inv.expiresAt < new Date() ? "This invitation has expired." : inv.email !== user.email.toLowerCase() ? `This invitation was sent to ${inv.email}. You are signed in as ${user.email}.` : null;
  return (
    <div className="flex min-h-screen flex-col items-center px-4 pt-10">
      <Logo href="/projects" />
      <div className="mt-24 w-full max-w-sm rounded-2xl border border-border p-6">
        {problem || !inv ? (
          <>
            <h1 className="text-lg font-semibold">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{problem}</p>
            <Link href="/projects" className="mt-5 inline-block text-sm underline underline-offset-4">
              Go to your workspace
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Join {inv.organization.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You have been invited as <span className="font-medium text-foreground lowercase">{inv.role.toLowerCase()}</span>
              {inv.project ? (
                <>
                  {" "}
                  on the project <span className="font-medium text-foreground">{inv.project.name}</span>
                </>
              ) : null}
              .
            </p>
            <AcceptInvite token={token} projectId={inv.project?.id ?? null} />
          </>
        )}
      </div>
    </div>
  );
}
