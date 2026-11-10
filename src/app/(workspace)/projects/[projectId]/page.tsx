import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertCircleIcon, CheckCircle2Icon, ClockIcon, FileSpreadsheetIcon, RotateCcwIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { SegmentTable } from "@/components/dashboard/segment-table";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { requireSessionUser } from "@/server/auth/session";
import { ApiError } from "@/server/errors";
import { getProject, getProjectOverview, listAssignableUsers } from "@/server/services/projects";
import { formatDate, pluralize } from "@/lib/format";
import { AddSegmentDialog } from "./add-segment-dialog";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  let data;
  try {
    data = await getProject(user.id, projectId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { project, access } = data;
  const overview = await getProjectOverview(user.id, projectId);
  const actors = access.level === "FULL" ? await listAssignableUsers(user.id, projectId) : [];
  const p = overview.progress;
  const locales = overview.languages.map((l) => ({ locale: l.locale, displayName: l.displayName }));
  const isFull = access.level === "FULL";
  const videoOptions = project.videos.map((v) => ({ id: v.id, title: v.title, locales: v.tracks.map((t) => t.locale) }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        title={project.name}
        description={project.description}
        meta={
          <>
            <span>Deadline {project.deadline ? formatDate(project.deadline) : "not set"}</span>
            <span aria-hidden>·</span>
            <span>{pluralize(project.videos.length, "video")}</span>
            <span aria-hidden>·</span>
            <span>{pluralize(overview.languages.length, "language")}</span>
            <span aria-hidden>·</span>
            <span>{pluralize(p.total, "segment")}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" render={<Link href={`/projects/${projectId}/team`} />}>
              <UsersIcon className="size-4" /> Team
            </Button>
            {isFull && (
              <>
                <Button variant="outline" render={<Link href={`/projects/${projectId}/import`} />}>
                  <FileSpreadsheetIcon className="size-4" /> Import
                </Button>
                <AddSegmentDialog projectId={projectId} videos={videoOptions} />
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Approved" value={p.approvedPercentage === null ? "N/A" : `${Math.round(p.approvedPercentage)}%`} hint={p.required ? `${p.approvedRequired} of ${p.required} required segments` : "No required segments"} icon={CheckCircle2Icon} tone="success" />
        <MetricCard label="Waiting for review" value={p.awaitingReview} hint="Submitted or in review" icon={ClockIcon} tone={p.awaitingReview ? "info" : "neutral"} />
        <MetricCard label="Changes requested" value={p.changesRequested} hint="Need a new version" icon={RotateCcwIcon} tone={p.changesRequested ? "warning" : "neutral"} />
        <MetricCard label="Overdue" value={overview.overdue} hint="Past due and not approved" icon={AlertCircleIcon} tone={overview.overdue ? "danger" : "neutral"} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Work queue</h2>
              <Link href={`/projects/${projectId}/segments`} className="text-sm text-muted-foreground hover:text-foreground">
                View all segments
              </Link>
            </div>
            <Suspense>
              <SegmentTable projectId={projectId} locales={locales} actors={actors.map((a) => ({ id: a.id, name: a.name }))} compact />
            </Suspense>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold">Languages</h2>
            {overview.languages.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No language tracks yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {overview.languages.map((l) => (
                  <li key={l.locale}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <Link href={`/projects/${projectId}/segments?locale=${l.locale}`} className="font-medium hover:underline">
                        {l.displayName} <span className="text-xs text-muted-foreground">{l.locale}</span>
                      </Link>
                      <span className="text-xs tabular-nums text-muted-foreground">{l.progress.approvedPercentage === null ? "N/A" : `${Math.round(l.progress.approvedPercentage)}%`}</span>
                    </div>
                    <ProgressBar value={l.progress.approvedPercentage} size="sm" label={`${l.displayName} progress`} />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {l.progress.approved}/{l.progress.total} approved{l.progress.awaitingReview ? ` · ${l.progress.awaitingReview} to review` : ""}
                      {l.overdue ? <span className="text-danger"> · {l.overdue} overdue</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {access.level !== "ACTOR" && (
            <section className="rounded-2xl border border-border p-5">
              <h2 className="mb-4 text-sm font-semibold">Recent activity</h2>
              <ActivityTimeline items={overview.recentActivity} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
