import { cn } from "@/lib/utils";

export function ProgressBar({ value, className, label, size = "md" }: { value: number | null; className?: string; label?: string; size?: "sm" | "md" }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(pct)}
      aria-valuetext={value === null ? "Not applicable" : `${Math.round(pct)}% approved`}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}
