import { CheckCircle2Icon, CircleDashedIcon, CircleDotIcon, ClockIcon, EyeIcon, RotateCcwIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEGMENT_STATUS_LABEL } from "@/lib/format";

const STYLES: Record<string, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  UNASSIGNED: { className: "bg-muted text-muted-foreground", icon: CircleDashedIcon },
  ASSIGNED: { className: "bg-muted text-foreground", icon: UserRoundIcon },
  SUBMITTED: { className: "bg-info-soft text-info", icon: ClockIcon },
  IN_REVIEW: { className: "bg-info-soft text-info", icon: EyeIcon },
  CHANGES_REQUESTED: { className: "bg-warning-soft text-warning", icon: RotateCcwIcon },
  APPROVED: { className: "bg-success-soft text-success", icon: CheckCircle2Icon },
  REOPENED: { className: "bg-warning-soft text-warning", icon: CircleDotIcon },
};

export function StatusBadge({ status, className, size = "sm" }: { status: string; className?: string; size?: "sm" | "md" }) {
  const s = STYLES[status] ?? STYLES.UNASSIGNED;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap", size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]", s.className, className)}>
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {SEGMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ProcessingBadge({ status, className }: { status: string; className?: string }) {
  const map: Record<string, string> = {
    PENDING_UPLOAD: "bg-muted text-muted-foreground",
    UPLOADED: "bg-info-soft text-info",
    PROCESSING: "bg-info-soft text-info animate-pulse-soft",
    READY: "bg-success-soft text-success",
    FAILED: "bg-danger-soft text-danger",
  };
  const label: Record<string, string> = { PENDING_UPLOAD: "Uploading", UPLOADED: "Queued", PROCESSING: "Processing", READY: "Ready", FAILED: "Failed" };
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium", map[status] ?? map.PENDING_UPLOAD, className)}>{label[status] ?? status}</span>;
}
