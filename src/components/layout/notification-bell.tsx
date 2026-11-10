"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";

type Notification = { id: string; title: string; body: string | null; href: string; readAt: string | null; createdAt: string; type: string };

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () => api.get<{ items: Notification[]; unreadCount: number }>("notifications?limit=8"),
    refetchInterval: 20_000,
    initialData: { items: [], unreadCount: initialUnread },
  });
  const unread = data?.unreadCount ?? initialUnread;

  async function open(n: Notification) {
    if (!n.readAt) {
      await api.patch(`notifications/${n.id}/read`, { read: true });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    router.push(n.href);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={unread ? `${unread} unread notifications` : "Notifications"} className="relative" />
        }
      >
        <BellIcon className="size-[18px]" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 flex size-2 rounded-full bg-foreground ring-2 ring-background" aria-hidden />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Link href="/notifications" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {data?.items.length ? (
            data.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-foreground"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                    <span className="block text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
