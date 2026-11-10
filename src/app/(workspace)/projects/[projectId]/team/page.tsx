import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { requireSessionUser } from "@/server/auth/session";
import { ApiError } from "@/server/errors";
import { getProject, listProjectTeam } from "@/server/services/projects";
import { TeamManager } from "./team-manager";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireSessionUser();
  let data;
  try {
    data = await getProject(user.id, projectId);
    if (data.access.level === "ACTOR") notFound();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const team = await listProjectTeam(user.id, projectId);
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects", href: "/projects" }, { label: data.project.name, href: `/projects/${projectId}` }, { label: "Team" }]} title="Team" description="Project-scoped access for editors, managers and voice actors. Organization owners and managers always have full access." />
      <TeamManager
        projectId={projectId}
        organizationId={data.project.organizationId}
        canManage={team.access.level === "FULL"}
        members={team.members.map((m) => ({ id: m.id, role: m.role, user: m.user }))}
        orgMembers={team.orgMembers.map((m) => ({ role: m.role, user: m.user }))}
        currentUserId={user.id}
      />
    </>
  );
}
