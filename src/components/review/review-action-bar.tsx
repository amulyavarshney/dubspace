"use client";

import { useState } from "react";
import { CheckIcon, Loader2Icon, RotateCcwIcon, UndoIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, api, errorMessage } from "@/lib/api";

export function ReviewActionBar({ recordingId, versionNumber, segmentRevision, canReview, canReopen, isCurrent, onDone }: { recordingId: string | null; versionNumber: number | null; segmentRevision: number; canReview: boolean; canReopen: boolean; isCurrent: boolean; onDone: () => void }) {
  const [dialog, setDialog] = useState<"approve" | "changes" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(decision: "APPROVED" | "CHANGES_REQUESTED" | "REOPENED") {
    if (!recordingId) return;
    setPending(true);
    try {
      await api.post(`recordings/${recordingId}/review`, { decision, reason: reason.trim() || undefined, expectedSegmentRevision: segmentRevision });
      toast.success(decision === "APPROVED" ? `Version ${versionNumber} approved` : decision === "REOPENED" ? "Segment reopened" : "Changes requested");
      setDialog(null);
      setReason("");
      onDone();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "STALE_REVISION") toast.error("This segment changed while you were reviewing. The page has been refreshed; please check the latest state.");
      else toast.error(errorMessage(e));
      onDone();
    } finally {
      setPending(false);
    }
  }

  if (!canReview && !canReopen) return null;

  return (
    <>
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {canReopen ? "This segment is approved. Reopen it to accept a new version." : isCurrent ? `Reviewing version ${versionNumber}` : "Switch to the latest version to make a decision."}
          </p>
          <div className="flex gap-2">
            {canReopen ? (
              <Button variant="outline" onClick={() => setDialog("reopen")}>
                <UndoIcon className="size-4" /> Reopen
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialog("changes")} disabled={!isCurrent}>
                  <RotateCcwIcon className="size-4" /> Request revision
                </Button>
                <Button onClick={() => setDialog("approve")} disabled={!isCurrent}>
                  <CheckIcon className="size-4" /> Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "approve" ? `Approve version ${versionNumber}?` : dialog === "reopen" ? "Reopen segment" : "Request a revision"}</DialogTitle>
            <DialogDescription>
              {dialog === "approve" ? "The segment will be marked approved and this version becomes the deliverable. You can reopen it later if needed." : dialog === "reopen" ? "The approval is withdrawn and the actor is asked for a new version. Give a reason so the team understands why." : "The actor will be notified and asked to upload a new version. Explain what should change."}
            </DialogDescription>
          </DialogHeader>
          {dialog !== "approve" && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="reason">Reason (required)</Label>
              <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Please improve the pronunciation at 00:12 and match the energy of the source." />
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => submit(dialog === "approve" ? "APPROVED" : dialog === "reopen" ? "REOPENED" : "CHANGES_REQUESTED")} disabled={pending || (dialog !== "approve" && !reason.trim())}>
              {pending && <Loader2Icon className="size-4 animate-spin" />}
              {dialog === "approve" ? "Approve" : dialog === "reopen" ? "Reopen" : "Request revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
