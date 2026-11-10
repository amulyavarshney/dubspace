import Link from "next/link";
import { cn } from "@/lib/utils";

/** Original Dubspace wordmark: three ascending bars evoke a waveform. */
export function Logo({ className, href = "/projects", compact = false }: { className?: string; href?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-foreground", className)} aria-label="Dubspace home">
      <span aria-hidden className="flex h-6 w-6 items-end justify-center gap-[3px] rounded-md bg-foreground px-1 pb-1">
        <span className="block h-2 w-[3px] rounded-full bg-background" />
        <span className="block h-4 w-[3px] rounded-full bg-background" />
        <span className="block h-3 w-[3px] rounded-full bg-background" />
      </span>
      {!compact && <span className="text-[17px]">Dubspace</span>}
    </Link>
  );
}
