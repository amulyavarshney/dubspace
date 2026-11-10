import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { SegmentTable } from "@/components/dashboard/segment-table";
import { requireSessionUser } from "@/server/auth/session";
import { ApiError } from "@/server/errors";
import { getProject, getProjectOverview, listAssignableUsers } from "@/server/services/projects";

export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  let data;
  try {
    data = await getProject(user.id, projectId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const overview = await getProjectOverview(user.id, projectId);
  const actors = data.access.level === "FULL" ? await listAssignableUsers(user.id, projectId) : [];
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects", href: "/projects" }, { label: data.project.name, href: `/projects/${projectId}` }, { label: "Segments" }]} title="Segments" description="Every line in the project with its assignee, latest version and review status." />
      <Suspense>
        <SegmentTable projectId={projectId} locales={overview.languages.map((l) => ({ locale: l.locale, displayName: l.displayName }))} actors={actors.map((a) => ({ id: a.id, name: a.name }))} />
      </Suspense>
    </>
  );
}
