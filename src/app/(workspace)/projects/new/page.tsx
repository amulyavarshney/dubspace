import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";
import { can } from "@/server/authorization/policy";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  if (!can.createProject(ctx.role)) redirect("/projects");
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects", href: "/projects" }, { label: "New project" }]} title="New project" description="Set up the source videos and target languages. You can also add everything later by importing a spreadsheet." />
      <NewProjectForm />
    </>
  );
}
