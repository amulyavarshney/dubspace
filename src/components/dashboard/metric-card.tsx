import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({ label, value, hint, icon: Icon, tone = "neutral", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "neutral" | "success" | "warning" | "danger" | "info"; className?: string }) {
  const toneClass = { neutral: "text-foreground", success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info" }[tone];
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight tabular-nums", toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
