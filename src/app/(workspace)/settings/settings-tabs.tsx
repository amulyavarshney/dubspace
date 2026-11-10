"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/settings/organization", label: "Organization" },
    { href: "/settings/members", label: "Members" },
    ...(isOwner ? [{ href: "/settings/ai-providers", label: "AI providers" }] : []),
  ];
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Settings sections">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors", active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
