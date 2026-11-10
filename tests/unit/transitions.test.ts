import { describe, expect, it } from "vitest";
import { canTransition, canUploadInStatus, computeProgress, isOverdue, isReviewable } from "@/server/services/transitions";

describe("segment state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("ASSIGNED", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "IN_REVIEW")).toBe(true);
    expect(canTransition("IN_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("IN_REVIEW", "CHANGES_REQUESTED")).toBe(true);
    expect(canTransition("CHANGES_REQUESTED", "SUBMITTED")).toBe(true);
    expect(canTransition("APPROVED", "REOPENED")).toBe(true);
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("APPROVED", "SUBMITTED")).toBe(false);
    expect(canTransition("ASSIGNED", "APPROVED")).toBe(false);
    expect(canTransition("CHANGES_REQUESTED", "APPROVED")).toBe(false);
  });
  it("blocks uploads on approved segments", () => {
    expect(canUploadInStatus("APPROVED")).toBe(false);
    expect(canUploadInStatus("CHANGES_REQUESTED")).toBe(true);
    expect(canUploadInStatus("REOPENED")).toBe(true);
  });
  it("only READY recordings in SUBMITTED/IN_REVIEW are reviewable", () => {
    expect(isReviewable("SUBMITTED", "READY")).toBe(true);
    expect(isReviewable("SUBMITTED", "PROCESSING")).toBe(false);
    expect(isReviewable("APPROVED", "READY")).toBe(false);
  });
});

describe("progress calculation", () => {
  it("returns N/A (null) with no required segments", () => {
    expect(computeProgress([]).approvedPercentage).toBeNull();
    expect(computeProgress([{ status: "APPROVED", required: false }]).approvedPercentage).toBeNull();
  });
  it("counts only required segments", () => {
    const p = computeProgress([
      { status: "APPROVED", required: true },
      { status: "APPROVED", required: false },
      { status: "SUBMITTED", required: true },
      { status: "IN_REVIEW", required: true },
      { status: "CHANGES_REQUESTED", required: true },
    ]);
    expect(p.required).toBe(4);
    expect(p.approvedPercentage).toBe(25);
    expect(p.awaitingReview).toBe(2);
    expect(p.changesRequested).toBe(1);
    expect(p.approved).toBe(2);
  });
  it("treats past due non-approved segments as overdue", () => {
    const past = new Date(Date.now() - 1000);
    expect(isOverdue(past, "ASSIGNED")).toBe(true);
    expect(isOverdue(past, "APPROVED")).toBe(false);
    expect(isOverdue(null, "ASSIGNED")).toBe(false);
  });
});
