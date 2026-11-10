import type { ProcessingStatus, SegmentStatus } from "@/generated/prisma/enums";

export const SEGMENT_TRANSITIONS: Record<SegmentStatus, readonly SegmentStatus[]> = {
  UNASSIGNED: ["ASSIGNED", "SUBMITTED"],
  ASSIGNED: ["SUBMITTED", "UNASSIGNED"],
  SUBMITTED: ["IN_REVIEW", "APPROVED", "CHANGES_REQUESTED"],
  IN_REVIEW: ["APPROVED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: ["SUBMITTED"],
  APPROVED: ["REOPENED"],
  REOPENED: ["SUBMITTED"],
};

export function canTransition(from: SegmentStatus, to: SegmentStatus): boolean {
  return SEGMENT_TRANSITIONS[from].includes(to);
}

/** Statuses in which a new recording version may be uploaded. */
export const UPLOADABLE_STATUSES: readonly SegmentStatus[] = [
  "UNASSIGNED",
  "ASSIGNED",
  "SUBMITTED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "REOPENED",
];

export function canUploadInStatus(status: SegmentStatus): boolean {
  return UPLOADABLE_STATUSES.includes(status);
}

/** Statuses from which a review decision can be made on the current version. */
export const REVIEWABLE_STATUSES: readonly SegmentStatus[] = ["SUBMITTED", "IN_REVIEW"];

export function isReviewable(status: SegmentStatus, processing: ProcessingStatus | null | undefined): boolean {
  return REVIEWABLE_STATUSES.includes(status) && processing === "READY";
}

export const PROCESSING_TRANSITIONS: Record<ProcessingStatus, readonly ProcessingStatus[]> = {
  PENDING_UPLOAD: ["UPLOADED", "FAILED"],
  UPLOADED: ["PROCESSING", "FAILED"],
  PROCESSING: ["READY", "FAILED"],
  READY: [],
  FAILED: ["UPLOADED"],
};

export type ProgressSummary = {
  total: number;
  required: number;
  approvedRequired: number;
  approvedPercentage: number | null;
  awaitingReview: number;
  changesRequested: number;
  approved: number;
  unassigned: number;
  assigned: number;
};

export function computeProgress(
  segments: Array<{ status: SegmentStatus; required: boolean }>,
): ProgressSummary {
  const required = segments.filter((s) => s.required);
  const approvedRequired = required.filter((s) => s.status === "APPROVED").length;
  return {
    total: segments.length,
    required: required.length,
    approvedRequired,
    approvedPercentage: required.length === 0 ? null : Math.round((approvedRequired / required.length) * 1000) / 10,
    awaitingReview: segments.filter((s) => s.status === "SUBMITTED" || s.status === "IN_REVIEW").length,
    changesRequested: segments.filter((s) => s.status === "CHANGES_REQUESTED" || s.status === "REOPENED").length,
    approved: segments.filter((s) => s.status === "APPROVED").length,
    unassigned: segments.filter((s) => s.status === "UNASSIGNED").length,
    assigned: segments.filter((s) => s.status === "ASSIGNED").length,
  };
}

export function isOverdue(dueAt: Date | null | undefined, status: SegmentStatus, now = new Date()): boolean {
  return !!dueAt && dueAt < now && status !== "APPROVED";
}
