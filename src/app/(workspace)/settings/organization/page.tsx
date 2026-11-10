import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrganizationSettingsPage() {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  const [org, counts] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id } }),
    Promise.all([prisma.organizationMember.count({ where: { organizationId: ctx.organization.id } }), prisma.project.count({ where: { organizationId: ctx.organization.id } }), prisma.auditEvent.count({ where: { organizationId: ctx.organization.id } })]),
  ]);
  const recent = ctx.role === "OWNER" ? await prisma.auditEvent.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 25 }) : [];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-5">
        <div className="rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold">General</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium">{org.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Slug</dt>
              <dd className="font-mono text-sm">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Your role</dt>
              <dd className="text-sm font-medium capitalize">{ctx.role.toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="text-sm">{formatDate(org.createdAt)}</dd>
            </div>
          </dl>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ["Members", counts[0]],
              ["Projects", counts[1]],
              ["Audit events", counts[2]],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="text-xl font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold">Organizations</h2>
          <p className="mt-1 text-sm text-muted-foreground">Switch organizations from the sidebar. Projects, members, credentials and usage never cross tenant boundaries.</p>
          <Button variant="outline" className="mt-4" render={<Link href="/onboarding?new=1" />}>
            Create another organization
          </Button>
        </div>
      </section>
      {ctx.role === "OWNER" && (
        <aside className="rounded-2xl border border-border p-5">
          <h2 className="text-sm font-semibold">Audit log</h2>
          <p className="mt-1 text-xs text-muted-foreground">Latest 25 security-relevant events.</p>
          <ul className="mt-4 space-y-3 text-xs">
            {recent.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2">
                <span className="font-mono">{e.action}</span>
                <span className="shrink-0 text-muted-foreground">{formatDate(e.createdAt)}</span>
              </li>
            ))}
            {recent.length === 0 && <li className="text-muted-foreground">No events yet.</li>}
          </ul>
        </aside>
      )}
    </div>
  );
}
