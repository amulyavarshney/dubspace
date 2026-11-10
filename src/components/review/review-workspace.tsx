"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, FileTextIcon, HistoryIcon, MessageSquareIcon } from "lucide-react";
import { AudioPlayer } from "@/components/audio/audio-player";
import { AssignDialog } from "@/components/review/assign-dialog";
import { CommentThread } from "@/components/review/comment-thread";
import { ReviewActionBar } from "@/components/review/review-action-bar";
import { UploadDropzone } from "@/components/review/upload-dropzone";
import { GenerateAiDialog } from "@/components/ai/generate-ai-dialog";
import { GenerationJobList } from "@/components/ai/generation-job-card";
import { ActivityTimeline, type ActivityItem } from "@/components/dashboard/activity-timeline";
import { ProcessingBadge, StatusBadge } from "@/components/dashboard/status-badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { api } from "@/lib/api";
import { formatBytes, formatDateTime, formatDue, formatDuration, formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommentDTO, SegmentDetailResponse } from "@/lib/types";

export function ReviewWorkspace({ initial, currentUserId }: { initial: SegmentDetailResponse; currentUserId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const sp = useSearchParams();
  const segmentId = initial.segment.id;
  const { data } = useQuery({
    queryKey: ["segment", segmentId],
    queryFn: () => api.get<SegmentDetailResponse>(`segments/${segmentId}`),
    initialData: initial,
    refetchInterval: (q) => (q.state.data?.segment.versions.some((v) => v.processingStatus === "UPLOADED" || v.processingStatus === "PROCESSING") ? 2500 : 15_000),
  });
  const { segment, permissions } = data;
  const activity = useQuery({ queryKey: ["segment-activity", segmentId], queryFn: async () => (await api.get<{ items: ActivityItem[] }>(`segments/${segmentId}/activity`)).items, refetchInterval: 20_000, enabled: permissions.accessLevel !== "ACTOR" });

  // `followCurrent` keeps the reviewer on the latest version as new ones arrive, until they pick one explicitly.
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(sp.get("version"));
  const [followCurrent, setFollowCurrent] = useState(!sp.get("version"));
  const [activeCommentId, setActiveCommentId] = useState<string | null>(sp.get("comment"));
  const [currentMs, setCurrentMs] = useState(0);

  // Fall back to the current version when the selection is missing (e.g. a new version just became current).
  const effectiveVersionId = !followCurrent && selectedVersionId && segment.versions.some((v) => v.id === selectedVersionId) ? selectedVersionId : (segment.currentVersionId ?? segment.versions[0]?.id ?? null);
  const version = segment.versions.find((v) => v.id === effectiveVersionId) ?? null;
  const readyVersion = version?.processingStatus === "READY" ? version : null;
  const player = useAudioPlayer(readyVersion?.durationMs ?? null);
  const { setSrc } = player;
  useEffect(() => {
    if (!readyVersion) setSrc(null, null);
  }, [readyVersion, setSrc]);
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["segment", segmentId] });
    qc.invalidateQueries({ queryKey: ["segment-activity", segmentId] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    router.refresh();
  }, [qc, segmentId, router]);

  // Mark as in review when a reviewer opens a submitted version.
  useEffect(() => {
    if (permissions.canReview && segment.status === "SUBMITTED" && readyVersion && readyVersion.id === segment.currentVersionId) {
      api.post(`recordings/${readyVersion.id}/start-review`).then(() => qc.invalidateQueries({ queryKey: ["segment", segmentId] })).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyVersion?.id, segment.status]);

  // Deep link: jump to a comment's timestamp once ready.
  useEffect(() => {
    if (!activeCommentId || !version) return;
    const c = version.comments.find((x) => x.id === activeCommentId);
    if (c) {
      player.seek(c.timestampMs);
      document.getElementById(`comment-${c.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCommentId, version?.id]);

  const markers = useMemo(() => (version?.comments ?? []).filter((c) => !c.parentId).map((c) => ({ id: c.id, ms: c.timestampMs, resolved: !!c.resolvedAt, active: c.id === activeCommentId, label: c.body.slice(0, 80) })), [version?.comments, activeCommentId]);
  const isCurrent = !!version && version.id === segment.currentVersionId;
  const due = formatDue(segment.activeAssignment?.dueAt ?? null);
  const latestDecision = version?.decisions[0] ?? null;
  const canResolve = (c: CommentDTO) => permissions.canReview || c.authorId === currentUserId || (permissions.accessLevel === "ACTOR" && !!segment.activeAssignment && segment.activeAssignment.actor.id === currentUserId);

  const onSeek = useCallback(
    (ms: number) => {
      player.seek(ms);
    },
    [player],
  );

  return (
    <div className="pb-4">
      <header className="mb-6">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${segment.project.id}`} className="hover:text-foreground">
            {segment.project.name}
          </Link>
          <span>/</span>
          <Link href={`/projects/${segment.project.id}/segments`} className="hover:text-foreground">
            Segments
          </Link>
          <span>/</span>
          <span className="text-foreground">{segment.externalId ?? "Segment"}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {segment.video.title} <span className="text-muted-foreground">·</span> {segment.language}
              {segment.externalId && <span className="ml-2 align-middle font-mono text-base font-normal text-muted-foreground">{segment.externalId}</span>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <StatusBadge status={segment.status} size="md" />
              <span className="font-mono text-xs tabular-nums">
                {formatMs(segment.startMs)} → {formatMs(segment.endMs)}
              </span>
              <span aria-hidden>·</span>
              <span>{segment.activeAssignment ? <>Actor <span className="font-medium text-foreground">{segment.activeAssignment.actor.name}</span></> : "Unassigned"}</span>
              <span aria-hidden>·</span>
              <span className={cn(due.tone === "danger" && "font-medium text-danger", due.tone === "warning" && "text-warning")}>{due.label}</span>
              {!segment.required && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Optional</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {permissions.canAssign && <AssignDialog projectId={segment.project.id} segmentId={segment.id} current={{ actorId: segment.activeAssignment?.actor.id ?? null, dueAt: segment.activeAssignment?.dueAt ?? null }} onDone={refresh} />}
            {permissions.canGenerateAi && <GenerateAiDialog segmentId={segment.id} script={segment.script} locale={segment.locale} onQueued={refresh} />}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileTextIcon className="size-4" /> Script
            </div>
            <p className="mt-3 text-[17px] leading-relaxed">{segment.script}</p>
            {segment.notes && (
              <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Direction:</span> {segment.notes}
              </p>
            )}
            {segment.video.referenceUrl && (
              <a href={segment.video.referenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm underline underline-offset-4">
                Reference video <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label htmlFor="version" className="text-sm font-semibold">
                  Recording
                </label>
                <NativeSelect id="version" value={effectiveVersionId ?? ""} onChange={(e) => {
                    setSelectedVersionId(e.target.value);
                    setFollowCurrent(e.target.value === segment.currentVersionId);
                    setActiveCommentId(null);
                  }} className="w-64" disabled={segment.versions.length === 0}>
                  {segment.versions.length === 0 && <option value="">No recordings yet</option>}
                  {segment.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} · {v.origin === "AI_GENERATED" ? "AI draft" : v.uploader?.name ?? "Upload"} · {v.processingStatus === "READY" ? formatDuration(v.durationMs) : v.processingStatus.toLowerCase()}
                      {v.isApproved ? " · approved" : v.isCurrent ? " · latest" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {version && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {version.origin === "AI_GENERATED" && <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wide text-background uppercase">AI generated</span>}
                  {version.isApproved && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Approved version</span>}
                  {!version.isCurrent && !version.isApproved && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Historical</span>}
                  <ProcessingBadge status={version.processingStatus} />
                  <span>{formatDateTime(version.createdAt)}</span>
                  <span>{formatBytes(version.sizeBytes)}</span>
                </div>
              )}
            </div>
            {version ? (
              version.processingStatus === "READY" ? (
                <AudioPlayer recordingId={version.id} peaks={version.peaks} durationMs={version.durationMs} markers={markers} onMarkerClick={(m) => setActiveCommentId(m.id)} onTimeChange={setCurrentMs} player={player} />
              ) : version.processingStatus === "FAILED" ? (
                <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 p-5 text-sm">
                  <p className="font-medium text-danger">This version failed processing</p>
                  <p className="mt-1 text-muted-foreground">{version.processingError ?? "The file could not be decoded."} Upload a new version to continue.</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-border p-5 text-sm text-muted-foreground" role="status">
                  <span className="size-2 animate-pulse rounded-full bg-info" /> Version {version.versionNumber} is {version.processingStatus === "PENDING_UPLOAD" ? "still uploading" : "being processed"}. The waveform appears automatically when ready.
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No recording yet. {permissions.canUpload ? "Upload the first take below." : "Waiting for the actor's first take."}</div>
            )}
            {latestDecision && (
              <div className={cn("mt-3 rounded-xl px-4 py-3 text-sm", latestDecision.decision === "APPROVED" ? "bg-success-soft/60" : "bg-warning-soft/60")}>
                <span className="font-medium">{latestDecision.reviewer.name}</span> {latestDecision.decision === "APPROVED" ? "approved" : latestDecision.decision === "REOPENED" ? "reopened" : "requested changes on"} this version · {formatDateTime(latestDecision.createdAt)}
                {latestDecision.reason && <p className="mt-1 text-muted-foreground">“{latestDecision.reason}”</p>}
              </div>
            )}
          </section>

          {permissions.canUpload && <UploadDropzone segmentId={segment.id} onUploaded={refresh} compact />}
          {!permissions.canUpload && permissions.accessLevel === "ACTOR" && segment.status === "APPROVED" && <p className="rounded-xl bg-success-soft/50 px-4 py-3 text-sm text-success">Approved. No further uploads are needed unless an editor reopens the segment.</p>}

          <GenerationJobList segmentId={segment.id} onChanged={refresh} />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Tabs defaultValue="comments" className="rounded-2xl border border-border bg-card">
            <TabsList className="m-2 grid grid-cols-2">
              <TabsTrigger value="comments">
                <MessageSquareIcon className="size-3.5" /> Feedback
              </TabsTrigger>
              <TabsTrigger value="activity">
                <HistoryIcon className="size-3.5" /> Activity
              </TabsTrigger>
            </TabsList>
            <TabsContent value="comments" className="h-[560px]">
              {version ? (
                <CommentThread recordingId={version.id} comments={version.comments} currentUserId={currentUserId} currentMs={currentMs} canComment={permissions.canComment && version.processingStatus === "READY"} canResolve={canResolve} historical={!isCurrent} activeCommentId={activeCommentId} onSeek={(ms) => onSeek(ms)} onChanged={refresh} />
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">Feedback attaches to a recording version. Upload or generate one first.</p>
              )}
            </TabsContent>
            <TabsContent value="activity" className="max-h-[560px] overflow-y-auto p-4">
              {permissions.accessLevel === "ACTOR" ? (
                <ol className="space-y-3 text-sm">
                  {segment.versions.flatMap((v) => v.decisions.map((d) => ({ v, d }))).map(({ v, d }) => (
                    <li key={d.id}>
                      <span className="font-medium">{d.reviewer.name}</span> {d.decision === "APPROVED" ? "approved" : d.decision === "REOPENED" ? "reopened" : "requested changes on"} v{v.versionNumber}
                      <span className="block text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
                    </li>
                  ))}
                  {segment.versions.every((v) => v.decisions.length === 0) && <li className="text-muted-foreground">No review decisions yet.</li>}
                </ol>
              ) : (
                <ActivityTimeline items={activity.data ?? []} emptyText="No activity recorded yet." />
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <ReviewActionBar recordingId={version?.id ?? null} versionNumber={version?.versionNumber ?? null} segmentRevision={segment.revision} canReview={permissions.canReview && !!readyVersion} canReopen={permissions.canReopen && !!version?.isApproved} isCurrent={isCurrent} onDone={refresh} />
    </div>
  );
}
