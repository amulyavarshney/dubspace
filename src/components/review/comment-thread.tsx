"use client";

import { useMemo, useState } from "react";
import { CheckIcon, CornerDownRightIcon, Loader2Icon, PencilIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { formatMs, formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommentDTO } from "@/lib/types";

export function TimestampChip({ ms, onClick, active }: { ms: number; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[11px] font-medium tabular-nums transition-colors", active ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-foreground hover:text-background")} aria-label={`Jump to ${formatMs(ms)}`}>
      {formatMs(ms)}
    </button>
  );
}

export function CommentThread({
  recordingId,
  comments,
  currentUserId,
  currentMs,
  canComment,
  canResolve,
  historical,
  activeCommentId,
  onSeek,
  onChanged,
}: {
  recordingId: string;
  comments: CommentDTO[];
  currentUserId: string;
  currentMs: number;
  canComment: boolean;
  canResolve: (c: CommentDTO) => boolean;
  historical: boolean;
  activeCommentId: string | null;
  onSeek: (ms: number) => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [pinnedMs, setPinnedMs] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [showResolved, setShowResolved] = useState(true);

  const threads = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId).sort((a, b) => a.timestampMs - b.timestampMs || a.createdAt.localeCompare(b.createdAt));
    return roots.map((r) => ({ root: r, replies: comments.filter((c) => c.parentId === r.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
  }, [comments]);
  const visible = threads.filter((t) => showResolved || !t.root.resolvedAt);
  const openCount = threads.filter((t) => !t.root.resolvedAt).length;

  async function submit() {
    if (!body.trim()) return;
    setPending(true);
    try {
      const ts = replyTo ? (comments.find((c) => c.id === replyTo)?.timestampMs ?? 0) : (pinnedMs ?? Math.round(currentMs));
      await api.post(`recordings/${recordingId}/comments`, { timestampMs: Math.round(ts), body: body.trim(), parentId: replyTo ?? undefined });
      setBody("");
      setReplyTo(null);
      setPinnedMs(null);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function resolve(c: CommentDTO, resolved: boolean) {
    try {
      await api.patch(`comments/${c.id}`, { resolved });
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function saveEdit() {
    if (!editing) return;
    try {
      await api.patch(`comments/${editing.id}`, { body: editing.body.trim() });
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">
          Feedback <span className="ml-1 text-xs font-normal text-muted-foreground">{openCount} open</span>
        </h2>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="accent-foreground" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
        </label>
      </div>
      {historical && <p className="mx-4 mb-2 rounded-lg bg-warning-soft/60 px-3 py-2 text-xs text-warning">You are viewing feedback on an earlier version. Timestamps refer to that version&apos;s waveform.</p>}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{comments.length ? "All feedback resolved." : "No feedback yet. Click the waveform to pick a time, then leave a note."}</p>
        ) : (
          <ul className="space-y-4">
            {visible.map(({ root, replies }) => (
              <li key={root.id} id={`comment-${root.id}`} className={cn("rounded-xl border p-3 transition-colors", root.id === activeCommentId ? "border-foreground" : "border-border", root.resolvedAt && "opacity-70")}>
                <CommentItem c={root} currentUserId={currentUserId} active={root.id === activeCommentId} onSeek={onSeek} editing={editing} setEditing={setEditing} saveEdit={saveEdit} />
                {replies.length > 0 && (
                  <ul className="mt-3 space-y-3 border-l border-border pl-3">
                    {replies.map((r) => (
                      <li key={r.id} id={`comment-${r.id}`}>
                        <CommentItem c={r} currentUserId={currentUserId} active={false} onSeek={onSeek} editing={editing} setEditing={setEditing} saveEdit={saveEdit} isReply />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex items-center gap-1">
                  {canComment && !historical && (
                    <Button variant="ghost" size="xs" onClick={() => setReplyTo(root.id)}>
                      <CornerDownRightIcon className="size-3" /> Reply
                    </Button>
                  )}
                  {canResolve(root) &&
                    (root.resolvedAt ? (
                      <Button variant="ghost" size="xs" onClick={() => resolve(root, false)}>
                        <RotateCcwIcon className="size-3" /> Reopen
                      </Button>
                    ) : (
                      <Button variant="ghost" size="xs" onClick={() => resolve(root, true)}>
                        <CheckIcon className="size-3" /> Resolve
                      </Button>
                    ))}
                  {root.resolvedAt && <span className="ml-auto text-[11px] text-success">Resolved</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canComment && !historical && (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            {replyTo ? (
              <>
                Replying to a thread
                <button className="underline" onClick={() => setReplyTo(null)}>
                  cancel
                </button>
              </>
            ) : (
              <>
                At <TimestampChip ms={pinnedMs ?? currentMs} onClick={() => setPinnedMs(pinnedMs === null ? Math.round(currentMs) : null)} active={pinnedMs !== null} />
                <span>{pinnedMs !== null ? "pinned · click to follow playhead" : "follows playhead · click to pin"}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder={replyTo ? "Write a reply…" : "Describe what should change at this moment…"}
              aria-label="New comment"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
              }}
            />
            <Button size="icon" aria-label="Post comment" onClick={submit} disabled={pending || !body.trim()}>
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({ c, currentUserId, active, onSeek, editing, setEditing, saveEdit, isReply }: { c: CommentDTO; currentUserId: string; active: boolean; onSeek: (ms: number) => void; editing: { id: string; body: string } | null; setEditing: (e: { id: string; body: string } | null) => void; saveEdit: () => void; isReply?: boolean }) {
  const mine = c.authorId === currentUserId;
  return (
    <div className="flex gap-2.5">
      <Avatar size="sm" className="mt-0.5">
        <AvatarFallback>{initials(c.author.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">{c.author.name}</span>
          {!isReply && <TimestampChip ms={c.timestampMs} onClick={() => onSeek(c.timestampMs)} active={active} />}
          <span className="text-muted-foreground">{formatRelative(c.createdAt)}</span>
          {c.editedAt && <span className="text-muted-foreground">(edited)</span>}
          {mine && !c.resolvedAt && editing?.id !== c.id && (
            <button className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Edit comment" onClick={() => setEditing({ id: c.id, body: c.body })}>
              <PencilIcon className="size-3" />
            </button>
          )}
        </div>
        {editing?.id === c.id ? (
          <div className="mt-1.5 space-y-1.5">
            <Textarea value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} rows={2} aria-label="Edit comment" />
            <div className="flex gap-1">
              <Button size="xs" onClick={saveEdit} disabled={!editing.body.trim()}>
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
        )}
      </div>
    </div>
  );
}
