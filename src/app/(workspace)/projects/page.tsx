import type { Metadata } from "next";
import Link from "next/link";
import { FolderPlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ProjectCard } from "@/components/dashboard/project-card";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";
import { listProjectsForUser } from "@/server/services/projects";
import { can } from "@/server/authorization/policy";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  const projects = await listProjectsForUser(user.id, ctx.organization.id);
  const canCreate = can.createProject(ctx.role);
  return (
    <>
      <PageHeader
        title="Projects"
        description={`Dubbing projects in ${ctx.organization.name}.`}
        actions={
          canCreate ? (
            <Button render={<Link href="/projects/new" />}>
              <PlusIcon className="size-4" /> New project
            </Button>
          ) : null
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlusIcon}
          title={canCreate ? "Create your first project" : "No projects yet"}
          description={canCreate ? "A project groups source videos, target languages and segments. Import your spreadsheet to get started in minutes." : "You will see projects here once a manager adds you to one or assigns you a segment."}
          action={
            canCreate ? (
              <Button render={<Link href="/projects/new" />}>
                <PlusIcon className="size-4" /> New project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </>
  );
}
