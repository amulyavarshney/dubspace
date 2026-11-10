import { format, formatDistanceToNowStrict, isToday, isTomorrow, isPast, differenceInCalendarDays } from "date-fns";

export function formatMs(ms: number | null | undefined, withMillis = false): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "--:--";
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const base = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (!withMillis) return base;
  return `${base}.${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatMs(ms);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy");
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy · HH:mm");
}

export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatDistanceToNowStrict(new Date(d), { addSuffix: true });
}

export function formatDue(d: Date | string | null | undefined): { label: string; tone: "neutral" | "warning" | "danger" } {
  if (!d) return { label: "No due date", tone: "neutral" };
  const date = new Date(d);
  if (isPast(date) && !isToday(date)) return { label: `Overdue · ${format(date, "MMM d")}`, tone: "danger" };
  if (isToday(date)) return { label: "Due today", tone: "warning" };
  if (isTomorrow(date)) return { label: "Due tomorrow", tone: "warning" };
  const days = differenceInCalendarDays(date, new Date());
  if (days <= 7) return { label: `Due in ${days} days`, tone: "neutral" };
  return { label: `Due ${format(date, "MMM d")}`, tone: "neutral" };
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const SEGMENT_STATUS_LABEL: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  SUBMITTED: "Awaiting review",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REOPENED: "Reopened",
};

export const PROCESSING_LABEL: Record<string, string> = {
  PENDING_UPLOAD: "Uploading",
  UPLOADED: "Queued",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
};

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
