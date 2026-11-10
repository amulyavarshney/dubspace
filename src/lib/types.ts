import type { getSegmentDetail } from "@/server/services/segments";

/** Recursively maps Date to string, matching what JSON serialization produces. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Jsonify<U>>
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type SegmentDetailResponse = Jsonify<{ segment: Awaited<ReturnType<typeof getSegmentDetail>>["segment"]; permissions: Awaited<ReturnType<typeof getSegmentDetail>>["permissions"] }>;
export type SegmentDetail = SegmentDetailResponse["segment"];
export type RecordingVersionDTO = SegmentDetail["versions"][number];
export type CommentDTO = RecordingVersionDTO["comments"][number];
export type Permissions = SegmentDetailResponse["permissions"];
