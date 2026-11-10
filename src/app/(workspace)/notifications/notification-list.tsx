"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOffIcon, CheckCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type N = { id: string; title: string; body: string | null; href: string; readAt: string | null; createdAt: string; type: string };
type Data = { items: N[]; unreadCount: number };

export function NotificationList({ initial }: { initial: Data }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications", "page"], queryFn: () => api.get<Data>("notifications?limit=100"), initialData: initial, refetchInterval: 20_000 });

  async function toggle(n: N) {
    await api.patch(`notifications/${n.id}/read`, { read: !n.readAt });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function readAll() {
    await api.post("notifications/read-all");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  if (!data.items.length) return <EmptyState icon={BellOffIcon} title="No notifications" description="You will be notified about new assignments, submissions ready for review, feedback and approvals." />;

  return (
    <div className="rounded-2xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm text-muted-foreground">{data.unreadCount ? `${data.unreadCount} unread` : "All read"}</p>
        <Button variant="ghost" size="sm" onClick={readAll} disabled={!data.unreadCount}>
          <CheckCheckIcon className="size-4" /> Mark all read
        </Button>
      </div>
      <ul>
        {data.items.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 border-b border-border/70 px-4 py-3 last:border-0", !n.readAt && "bg-muted/30")}>
            <button onClick={() => toggle(n)} aria-label={n.readAt ? "Mark unread" : "Mark read"} className="mt-2 size-2.5 shrink-0 rounded-full ring-2 ring-transparent hover:ring-border" style={{ background: n.readAt ? "transparent" : "var(--foreground)", border: n.readAt ? "1px solid var(--border)" : undefined }} />
            <div className="min-w-0 flex-1">
              <Link
                href={n.href}
                onClick={() => {
                  if (!n.readAt) void api.patch(`notifications/${n.id}/read`, { read: true }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
                }}
                className="block text-sm font-medium hover:underline"
              >
                {n.title}
              </Link>
              {n.body && <p className="truncate text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{formatRelative(n.createdAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
