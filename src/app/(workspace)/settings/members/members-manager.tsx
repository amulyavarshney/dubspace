"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyIcon, Loader2Icon, MailPlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { api, errorMessage } from "@/lib/api";
import { formatDate, initials } from "@/lib/format";

type Member = { id: string; role: string; createdAt: string; user: { id: string; name: string; email: string } };
type Invitation = { id: string; email: string; role: string; project: string | null; expiresAt: string };

const ROLES = [
  { value: "OWNER", label: "Owner", help: "Manage members, credentials and everything else" },
  { value: "MANAGER", label: "Manager", help: "Create projects, import, assign, review" },
  { value: "EDITOR", label: "Editor", help: "Review, comment, approve" },
  { value: "ACTOR", label: "Voice actor", help: "Only assigned segments" },
];

export function MembersManager({ organizationId, currentUserId, currentRole, members, invitations }: { organizationId: string; currentUserId: string; currentRole: string; members: Member[]; invitations: Invitation[] }) {
  const router = useRouter();
  const isOwner = currentRole === "OWNER";
  const canInvite = currentRole === "OWNER" || currentRole === "MANAGER";
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EDITOR");
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function changeRole(m: Member, next: string) {
    try {
      await api.patch(`organizations/${organizationId}/members/${m.user.id}`, { role: next });
      toast.success("Role updated");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove(m: Member) {
    if (!confirm(`Remove ${m.user.name} from the organization? Their project access and active assignments will be removed.`)) return;
    try {
      await api.delete(`organizations/${organizationId}/members/${m.user.id}`);
      toast.success("Member removed");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function revoke(i: Invitation) {
    try {
      await api.delete(`organizations/${organizationId}/invitations/${i.id}`);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await api.post<{ acceptUrl: string }>(`organizations/${organizationId}/invitations`, { email, role });
      setLink(`${window.location.origin}${res.acceptUrl}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{members.length} members</p>
        {canInvite && (
          <Button
            onClick={() => {
              setLink(null);
              setOpen(true);
            }}
          >
            <MailPlusIcon className="size-4" /> Invite member
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Member</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Joined</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(m.user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {m.user.name} {m.user.id === currentUserId && <span className="text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {isOwner ? (
                    <NativeSelect aria-label={`Role for ${m.user.name}`} value={m.role} onChange={(e) => changeRole(m, e.target.value)} className="w-36">
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <span className="capitalize">{m.role.toLowerCase()}</span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">{formatDate(m.createdAt)}</td>
                <td className="px-3 py-2.5 text-right">
                  {isOwner && m.user.id !== currentUserId && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.user.name}`} onClick={() => remove(m)}>
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invitations.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {i.role.toLowerCase()}
                    {i.project ? ` · ${i.project}` : ""} · expires {formatDate(i.expiresAt)}
                  </span>
                </span>
                {canInvite && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(i)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {link ? (
            <>
              <DialogHeader>
                <DialogTitle>Invitation created</DialogTitle>
                <DialogDescription>Share this link with {email}. It expires in 7 days and can only be accepted by that email address.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex gap-2">
                <Input readOnly value={link} aria-label="Invitation link" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(link);
                    toast.success("Copied");
                  }}
                >
                  <CopyIcon className="size-4" />
                </Button>
              </div>
              <DialogFooter className="mt-6">
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={invite}>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>Invitations are tied to the email address and expire after 7 days.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-email">Email</Label>
                  <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-role">Role</Label>
                  <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.filter((r) => isOwner || r.value === "EDITOR" || r.value === "ACTOR").map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === role)?.help}</p>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !email}>
                  {pending && <Loader2Icon className="size-4 animate-spin" />} Create invitation
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
