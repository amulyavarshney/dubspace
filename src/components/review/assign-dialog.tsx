"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, UserRoundPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { api, errorMessage } from "@/lib/api";

export function AssignDialog({ projectId, segmentId, current, onDone }: { projectId: string; segmentId: string; current: { actorId: string | null; dueAt: string | null }; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [actorId, setActorId] = useState(current.actorId ?? "");
  const [due, setDue] = useState(current.dueAt ? toLocalInput(new Date(current.dueAt)) : "");
  const [pending, setPending] = useState(false);
  const { data } = useQuery({ queryKey: ["assignable", projectId], queryFn: () => api.get<{ items: Array<{ id: string; name: string; email: string; orgRole: string }> }>(`projects/${projectId}/assignable-users`), enabled: open });

  function openDialog() {
    setActorId(current.actorId ?? "");
    setDue(current.dueAt ? toLocalInput(new Date(current.dueAt)) : "");
    setOpen(true);
  }

  async function save() {
    setPending(true);
    try {
      await api.post(`segments/${segmentId}/assignments`, { actorUserId: actorId || null, dueAt: due ? new Date(due).toISOString() : null });
      toast.success(actorId ? "Actor assigned" : "Assignment removed");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <UserRoundPlusIcon className="size-4" /> {current.actorId ? "Reassign" : "Assign actor"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assignment</DialogTitle>
            <DialogDescription>One active assignee per segment. The actor is notified and gains access to this segment only.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="actor">Voice actor</Label>
              <NativeSelect id="actor" value={actorId} onChange={(e) => setActorId(e.target.value)}>
                <option value="">Unassigned</option>
                {(data?.items ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.email}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">Due</Label>
              <Input id="due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2Icon className="size-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
