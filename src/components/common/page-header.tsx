import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

export function PageHeader({ title, description, crumbs, actions, meta, className }: { title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("mb-8", className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRightIcon className="size-3" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
