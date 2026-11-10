import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ImportWizard } from "@/components/imports/import-wizard";
import { requireSessionUser } from "@/server/auth/session";
import { ApiError } from "@/server/errors";
import { getProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Import spreadsheet" };

export default async function ImportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  let data;
  try {
    data = await getProject(user.id, projectId);
    if (data.access.level !== "FULL") notFound();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects", href: "/projects" }, { label: data.project.name, href: `/projects/${projectId}` }, { label: "Import" }]} title="Import spreadsheet" description="Bring your existing Excel or CSV tracker in. Map columns, review validation results, then import." />
      <ImportWizard projectId={projectId} />
    </>
  );
}
