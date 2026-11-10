import type { OrgRole, ProjectRole } from "@/generated/prisma/enums";

/**
 * Pure permission policy. Access levels collapse organization and project roles into
 * what a user may do inside one project:
 *
 *  - FULL:   manage project, assign actors, review, upload, generate AI drafts
 *  - REVIEW: review, comment, upload, generate AI drafts
 *  - ACTOR:  assigned segments only; upload and comment on own assignments
 *  - NONE:   no access
 */
export type AccessLevel = "FULL" | "REVIEW" | "ACTOR" | "NONE";

export function orgRoleToAccess(role: OrgRole | null | undefined): AccessLevel {
  switch (role) {
    case "OWNER":
    case "MANAGER":
      return "FULL";
    case "EDITOR":
      return "REVIEW";
    case "ACTOR":
      return "ACTOR";
    default:
      return "NONE";
  }
}

export function projectRoleToAccess(role: ProjectRole | null | undefined): AccessLevel {
  switch (role) {
    case "MANAGER":
      return "FULL";
    case "EDITOR":
      return "REVIEW";
    case "ACTOR":
      return "ACTOR";
    default:
      return "NONE";
  }
}

const RANK: Record<AccessLevel, number> = { NONE: 0, ACTOR: 1, REVIEW: 2, FULL: 3 };

export function maxAccess(a: AccessLevel, b: AccessLevel): AccessLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Org ACTORs only get project access through explicit project membership. */
export function resolveProjectAccess(orgRole: OrgRole | null, projectRole: ProjectRole | null): AccessLevel {
  const fromOrg = orgRole === "ACTOR" ? "NONE" : orgRoleToAccess(orgRole);
  if (!orgRole) return "NONE"; // must be an org member to access anything in the tenant
  return maxAccess(fromOrg, projectRoleToAccess(projectRole));
}

export const can = {
  manageOrganization: (orgRole: OrgRole | null) => orgRole === "OWNER",
  manageProviderCredentials: (orgRole: OrgRole | null) => orgRole === "OWNER",
  createProject: (orgRole: OrgRole | null) => orgRole === "OWNER" || orgRole === "MANAGER",
  manageProject: (access: AccessLevel) => access === "FULL",
  assign: (access: AccessLevel) => access === "FULL",
  review: (access: AccessLevel) => access === "FULL" || access === "REVIEW",
  comment: (access: AccessLevel) => access !== "NONE",
  upload: (access: AccessLevel) => access !== "NONE",
  generateAi: (access: AccessLevel) => access === "FULL" || access === "REVIEW",
  viewFullDashboard: (access: AccessLevel) => access === "FULL" || access === "REVIEW",
};
