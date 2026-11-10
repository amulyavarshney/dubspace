import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { requireSessionUser } from "@/server/auth/session";
import { ApiError } from "@/server/errors";
import { getSegmentDetail } from "@/server/services/segments";
import type { SegmentDetailResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Review" };

export default async function SegmentPage({ params }: { params: Promise<{ projectId: string; segmentId: string }> }) {
  const { projectId, segmentId } = await params;
  const user = await requireSessionUser();
  let detail;
  try {
    detail = await getSegmentDetail(user.id, segmentId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if (detail.segment.project.id !== projectId) notFound();
  const initial = JSON.parse(JSON.stringify({ segment: detail.segment, permissions: detail.permissions })) as SegmentDetailResponse;
  return (
    <Suspense>
      <ReviewWorkspace initial={initial} currentUserId={user.id} />
    </Suspense>
  );
}
