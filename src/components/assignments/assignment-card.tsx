import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { formatDue, formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { listMyAssignments } from "@/server/services/assignments";

type Item = Awaited<ReturnType<typeof listMyAssignments>>[number];

export function AssignmentCard({ assignment }: { assignment: Item }) {
  const s = assignment.segment;
  const due = formatDue(assignment.dueAt);
  const href = `/projects/${s.project.id}/segments/${s.id}`;
  const needsAction = s.status === "ASSIGNED" || s.status === "CHANGES_REQUESTED" || s.status === "REOPENED";
  return (
    <Link href={href} className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {s.project.name} · {s.video.title} · {s.language}
        </span>
        <StatusBadge status={s.status} />
      </div>
      <p className="mt-2 line-clamp-2 text-[15px] leading-snug font-medium">{s.script}</p>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground tabular-nums">
          {s.externalId ? `${s.externalId} · ` : ""}
          {formatMs(s.startMs)} → {formatMs(s.endMs)}
        </span>
        <span className={cn(due.tone === "danger" ? "font-medium text-danger" : due.tone === "warning" ? "text-warning" : "text-muted-foreground")}>{due.label}</span>
      </div>
      {s.latestDecision?.reason && s.status === "CHANGES_REQUESTED" && <p className="mt-3 rounded-lg bg-warning-soft/60 px-3 py-2 text-xs text-warning">“{s.latestDecision.reason}”</p>}
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
        {needsAction ? "Upload recording" : s.currentVersion ? `Version ${s.currentVersion.versionNumber} submitted` : "Open"} <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
