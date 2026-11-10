"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyIcon, Loader2Icon, MailPlusIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/common/empty-state";
import { api, errorMessage } from "@/lib/api";
import { initials } from "@/lib/format";

type U = { id: string; name: string; email: string; image?: string | null };
type Member = { id: string; role: string; user: U };

const ROLE_HELP: Record<string, string> = { MANAGER: "Assign actors, import, edit deadlines, review", EDITOR: "Review, comment, approve, request changes", ACTOR: "Upload recordings for assigned segments only" };

export function TeamManager({ projectId, organizationId, canManage, members, orgMembers, currentUserId }: { projectId: string; organizationId: string; canManage: boolean; members: Member[]; orgMembers: Array<{ role: string; user: U }>; currentUserId: string }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("ACTOR");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ACTOR");
  const [pending, setPending] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const candidates = orgMembers.filter((m) => !members.some((x) => x.user.id === m.user.id));

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await api.post(`projects/${projectId}/team`, { userId, role });
      toast.success("Member added");
      setAddOpen(false);
      setUserId("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await api.post<{ acceptUrl: string }>(`organizations/${organizationId}/invitations`, { email, role: inviteRole === "MANAGER" ? "EDITOR" : inviteRole, projectId, projectRole: inviteRole });
      setInviteLink(`${window.location.origin}${res.acceptUrl}`);
      toast.success("Invitation created");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function remove(member: Member) {
    if (!confirm(`Remove ${member.user.name} from this project?`)) return;
    try {
      await api.delete(`projects/${projectId}/team/${member.user.id}`);
      toast.success("Member removed");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const grouped = ["MANAGER", "EDITOR", "ACTOR"].map((r) => ({ role: r, items: members.filter((m) => m.role === r) }));

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddOpen(true)} disabled={candidates.length === 0} title={candidates.length === 0 ? "Everyone in the organization is already on this project" : undefined}>
            <UserPlusIcon className="size-4" /> Add from organization
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setInviteLink(null);
              setInviteOpen(true);
            }}
          >
            <MailPlusIcon className="size-4" /> Invite by email
          </Button>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState icon={UserPlusIcon} title="No project-specific members" description="Owners, managers and editors of the organization can already access this project. Add voice actors or project-scoped collaborators here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {grouped.map((g) => (
            <section key={g.role} className="rounded-2xl border border-border p-4">
              <h2 className="text-sm font-semibold capitalize">{g.role.toLowerCase()}s</h2>
              <p className="mb-3 text-xs text-muted-foreground">{ROLE_HELP[g.role]}</p>
              {g.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-2">
                  {g.items.map((m) => (
                    <li key={m.id} className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        <AvatarFallback>{initials(m.user.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{m.user.email}</span>
                      </span>
                      {canManage && m.user.id !== currentUserId && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.user.name}`} onClick={() => remove(m)}>
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form onSubmit={addMember}>
            <DialogHeader>
              <DialogTitle>Add organization member</DialogTitle>
              <DialogDescription>Give an existing member a role on this project.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="member">Member</Label>
                <NativeSelect id="member" value={userId} onChange={(e) => setUserId(e.target.value)} required>
                  <option value="" disabled>
                    Select a person
                  </option>
                  {candidates.map((c) => (
                    <option key={c.user.id} value={c.user.id}>
                      {c.user.name} · {c.user.email}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Project role</Label>
                <NativeSelect id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="ACTOR">Voice actor</option>
                  <option value="EDITOR">Editor</option>
                  <option value="MANAGER">Manager</option>
                </NativeSelect>
                <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !userId}>
                {pending && <Loader2Icon className="size-4 animate-spin" />} Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          {inviteLink ? (
            <>
              <DialogHeader>
                <DialogTitle>Invitation ready</DialogTitle>
                <DialogDescription>An email has been queued. You can also share this link directly; it expires in 7 days and only works for {email}.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex gap-2">
                <Input readOnly value={inviteLink} aria-label="Invitation link" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    toast.success("Copied");
                  }}
                >
                  <CopyIcon className="size-4" /> Copy
                </Button>
              </div>
              <DialogFooter className="mt-6">
                <Button onClick={() => setInviteOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={invite}>
              <DialogHeader>
                <DialogTitle>Invite to project</DialogTitle>
                <DialogDescription>The person joins the organization with minimal permissions and gets the selected role on this project.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="actor@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inviteRole">Project role</Label>
                  <NativeSelect id="inviteRole" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="ACTOR">Voice actor</option>
                    <option value="EDITOR">Editor</option>
                    <option value="MANAGER">Manager</option>
                  </NativeSelect>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !email}>
                  {pending && <Loader2Icon className="size-4 animate-spin" />} Send invitation
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
