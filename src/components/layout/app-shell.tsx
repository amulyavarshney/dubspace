"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, LogOutIcon, MenuIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";
import { api, errorMessage } from "@/lib/api";
import { initials } from "@/lib/format";

export type ShellUser = { id: string; name: string; email: string };
export type ShellOrg = { id: string; name: string; role: string; memberships: Array<{ organizationId: string; name: string; role: string }> };

export function AppShell({ user, org, unread, children }: { user: ShellUser; org: ShellOrg; unread: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const showSettings = org.role === "OWNER";

  async function switchOrg(organizationId: string) {
    try {
      await api.post("organizations/switch", { organizationId });
      router.push("/projects");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>
      <div className="px-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted" aria-label="Switch organization" />
            }
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-muted text-[11px] font-semibold uppercase">{initials(org.name)}</span>
            <span className="flex-1 truncate font-medium">{org.name}</span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {org.memberships.map((m) => (
              <DropdownMenuItem key={m.organizationId} onClick={() => m.organizationId !== org.id && switchOrg(m.organizationId)}>
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-[11px] text-muted-foreground capitalize">{m.role.toLowerCase()}</span>
                {m.organizationId === org.id && <CheckIcon className="size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/onboarding?new=1")}>
              <PlusIcon className="size-4" /> New organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-5 flex-1 overflow-y-auto px-3">
        <SidebarNav unread={unread} showSettings={showSettings} onNavigate={() => setOpen(false)} />
      </div>
      <div className="border-t border-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted" aria-label="Account menu" />}>
            <Avatar size="sm">
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-xs text-muted-foreground">Signed in as</span>
              <span className="block truncate">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} variant="destructive">
              <LogOutIcon className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
              <MenuIcon className="size-5" />
            </Button>
            <Logo />
          </div>
          <NotificationBell initialUnread={unread} />
        </header>
        <div className="hidden h-14 items-center justify-end gap-2 px-8 lg:flex">
          <NotificationBell initialUnread={unread} />
        </div>
        <main className="flex-1 px-4 pb-16 sm:px-6 lg:px-10 lg:pt-2">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
    </div>
  );
}
