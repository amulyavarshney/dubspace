"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, BuildingIcon, FolderKanbanIcon, MicIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; match?: (p: string) => boolean; badge?: number };

export function SidebarNav({ unread, showSettings, onNavigate }: { unread: number; showSettings: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const workspace: Item[] = [
    { href: "/projects", label: "Projects", icon: FolderKanbanIcon, match: (p) => p.startsWith("/projects") },
    { href: "/my-assignments", label: "My assignments", icon: MicIcon },
    { href: "/notifications", label: "Notifications", icon: BellIcon, badge: unread },
  ];
  const settings: Item[] = [
    { href: "/settings/organization", label: "Organization", icon: BuildingIcon },
    { href: "/settings/members", label: "Members", icon: UsersIcon },
    { href: "/settings/ai-providers", label: "AI providers", icon: SparklesIcon },
  ];
  const render = (items: Item[]) =>
    items.map((item) => {
      const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
            active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
          )}
        >
          <Icon className={cn("size-4", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")} />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-semibold text-background">{item.badge > 99 ? "99+" : item.badge}</span> : null}
        </Link>
      );
    });
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      <div className="flex flex-col gap-0.5">
        <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">Workspace</p>
        {render(workspace)}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">Settings</p>
        {render(showSettings ? settings : settings.filter((s) => s.href !== "/settings/ai-providers" && s.href !== "/settings/members"))}
      </div>
    </nav>
  );
}
