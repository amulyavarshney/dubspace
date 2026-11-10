import { formatRelative } from "@/lib/format";

const LABELS: Record<string, string> = {
  "project.created": "created the project",
  "assignment.created": "assigned an actor",
  "assignment.removed": "removed an assignment",
  "recording.upload_started": "started an upload",
  "recording.uploaded": "uploaded a recording",
  "recording.ready": "recording processed",
  "recording.processing_failed": "recording failed processing",
  "recording.approved": "approved a recording",
  "revision.requested": "requested changes",
  "segment.reopened": "reopened a segment",
  "review.started": "started a review",
  "comment.created": "left feedback",
  "comment.resolved": "resolved a comment",
  "comment.reopened": "reopened a comment",
  "comment.edited": "edited a comment",
  "import.previewed": "previewed an import",
  "import.committed": "imported a spreadsheet",
  "segment.created": "added a segment",
  "segment.updated": "edited a segment",
  "video.created": "added a video",
  "project.member_added": "added a team member",
  "project.member_removed": "removed a team member",
  "ai.generation_requested": "requested an AI draft",
  "ai.generation_completed": "AI draft generated",
  "ai.generation_failed": "AI draft failed",
  "ai.generation_cancelled": "cancelled an AI draft",
};

export type ActivityItem = { id: string; action: string; actorName: string | null; createdAt: Date | string; metadata?: unknown };

export function ActivityTimeline({ items, emptyText = "No activity yet." }: { items: ActivityItem[]; emptyText?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-4">
      {items.map((it) => {
        const meta = (it.metadata ?? {}) as Record<string, unknown>;
        const detail = typeof meta.reason === "string" ? meta.reason : typeof meta.versionNumber === "number" ? `v${meta.versionNumber}` : null;
        return (
          <li key={it.id} className="relative text-sm">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-foreground/70" aria-hidden />
            <p>
              <span className="font-medium">{it.actorName ?? "System"}</span> <span className="text-muted-foreground">{LABELS[it.action] ?? it.action.replace(/[._]/g, " ")}</span>
              {detail && <span className="text-muted-foreground"> · {detail}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{formatRelative(it.createdAt)}</p>
          </li>
        );
      })}
    </ol>
  );
}
