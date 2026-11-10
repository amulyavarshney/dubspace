import Link from "next/link";
import { CalendarIcon, ClockIcon, LanguagesIcon } from "lucide-react";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { formatDate, pluralize } from "@/lib/format";
import type { ProjectListItem } from "@/server/services/projects";

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const p = project.progress;
  return (
    <Link href={`/projects/${project.id}`} className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{project.name}</h3>
          {project.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">{project.access.toLowerCase()}</span>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{p.approvedPercentage === null ? "No required segments yet" : `${p.approvedRequired} of ${p.required} approved`}</span>
          <span className="font-semibold tabular-nums">{p.approvedPercentage === null ? "N/A" : `${Math.round(p.approvedPercentage)}%`}</span>
        </div>
        <ProgressBar value={p.approvedPercentage} label={`${project.name} progress`} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <LanguagesIcon className="size-3.5" /> {project.languages.length ? project.languages.join(", ") : "No languages"}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarIcon className="size-3.5" /> {project.deadline ? formatDate(project.deadline) : "No deadline"}
        </span>
        {p.awaitingReview > 0 && (
          <span className="inline-flex items-center gap-1 text-info">
            <ClockIcon className="size-3.5" /> {pluralize(p.awaitingReview, "review")} waiting
          </span>
        )}
        {project.overdue > 0 && <span className="font-medium text-danger">{pluralize(project.overdue, "overdue segment")}</span>}
      </div>
    </Link>
  );
}
