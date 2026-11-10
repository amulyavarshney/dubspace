"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ProcessingBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { api, errorMessage } from "@/lib/api";
import { formatDue, formatRelative, SEGMENT_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  externalId: string | null;
  script: string;
  status: string;
  locale: string;
  language: string;
  video: { id: string; title: string };
  actor: { id: string; name: string; email: string } | null;
  dueAt: string | null;
  overdue: boolean;
  lastActivityAt: string;
  currentVersion: { id: string; versionNumber: number; processingStatus: string; origin: string } | null;
};
type Page = { page: number; pageSize: number; total: number; totalPages: number; access: string; items: Row[] };

export function SegmentTable({ projectId, locales, actors, compact = false, initialStatus }: { projectId: string; locales: Array<{ locale: string; displayName: string }>; actors: Array<{ id: string; name: string }>; compact?: boolean; initialStatus?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const status = sp.get("status") ?? initialStatus ?? "";
  const locale = sp.get("locale") ?? "";
  const actor = sp.get("actor") ?? "";
  const overdue = sp.get("overdue") === "true";
  const page = Number(sp.get("page") ?? "1");
  const pageSize = compact ? 8 : 25;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: "lastActivityAt", dir: "desc" });
    if (status) p.set("status", status);
    if (locale) p.set("locale", locale);
    if (actor) p.set("actorUserId", actor);
    if (overdue) p.set("overdue", "true");
    if (debouncedQ) p.set("q", debouncedQ);
    return p.toString();
  }, [page, pageSize, status, locale, actor, overdue, debouncedQ]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["segments", projectId, query],
    queryFn: () => api.get<Page>(`projects/${projectId}/segments?${query}`),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  const base = `/projects/${projectId}/segments`;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search segments" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search script or segment id" className="pl-8" />
        </div>
        <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => setParam("status", e.target.value)} className="w-44">
          <option value="">All statuses</option>
          {Object.entries(SEGMENT_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filter by language" value={locale} onChange={(e) => setParam("locale", e.target.value)} className="w-40">
          <option value="">All languages</option>
          {locales.map((l) => (
            <option key={l.locale} value={l.locale}>
              {l.displayName}
            </option>
          ))}
        </NativeSelect>
        {actors.length > 0 && (
          <NativeSelect aria-label="Filter by actor" value={actor} onChange={(e) => setParam("actor", e.target.value)} className="w-40">
            <option value="">All actors</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm">
          <input type="checkbox" className="accent-foreground" checked={overdue} onChange={(e) => setParam("overdue", e.target.checked ? "true" : "")} />
          Overdue only
        </label>
      </div>

      {isError ? (
        <div className="p-4">
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        </div>
      ) : isLoading && !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No segments match" description={status || locale || actor || overdue || debouncedQ ? "Try clearing a filter." : "Import a spreadsheet or add a segment to populate the work queue."} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Segment</th>
                <th className="px-3 py-2.5 font-medium">Language</th>
                <th className="px-3 py-2.5 font-medium">Actor</th>
                <th className="px-3 py-2.5 font-medium">Version</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Due</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Last activity</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => {
                const due = formatDue(row.dueAt);
                return (
                  <tr key={row.id} className="group border-b border-border/70 last:border-0 hover:bg-muted/40">
                    <td className="max-w-[320px] px-4 py-2.5">
                      <Link href={`${base}/${row.id}`} className="block">
                        <span className="block truncate font-medium">{row.externalId ?? row.script.slice(0, 40)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.video.title} · {row.script}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.language}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.actor ? row.actor.name : <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.currentVersion ? (
                        <span className="inline-flex items-center gap-1.5">
                          v{row.currentVersion.versionNumber}
                          {row.currentVersion.origin === "AI_GENERATED" && <span className="rounded bg-muted px-1 text-[10px] font-semibold tracking-wide uppercase">AI</span>}
                          {row.currentVersion.processingStatus !== "READY" && <ProcessingBadge status={row.currentVersion.processingStatus} />}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={cn("px-3 py-2.5 text-xs whitespace-nowrap", due.tone === "danger" ? "font-medium text-danger" : due.tone === "warning" ? "text-warning" : "text-muted-foreground")}>{due.label}</td>
                    <td className="hidden px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground md:table-cell">{formatRelative(row.lastActivityAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="ghost" size="sm" render={<Link href={`${base}/${row.id}`} />} className="opacity-70 group-hover:opacity-100">
                        {row.status === "SUBMITTED" || row.status === "IN_REVIEW" ? "Review" : "Open"} <ArrowRightIcon className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Page {data.page} of {data.totalPages} · {data.total} segments
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={data.page <= 1} onClick={() => setParam("page", String(data.page - 1))}>
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={data.page >= data.totalPages} onClick={() => setParam("page", String(data.page + 1))}>
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
