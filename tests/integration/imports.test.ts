import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { prisma } from "@/server/db/prisma";
import { commitImport, previewImport } from "@/server/services/imports";
import { addMember, createOrgWithOwner, resetDatabase } from "../helpers/db";

async function buildXlsx(rows: Array<Record<string, string | number>>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Lines");
  ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k }));
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("spreadsheet import", () => {
  let owner: { id: string };
  let orgId: string;
  let projectId: string;
  let actorEmail: string;

  beforeAll(async () => {
    await resetDatabase();
    const c = await createOrgWithOwner();
    owner = c.owner;
    orgId = c.org.id;
    const actor = await addMember(orgId, "ACTOR");
    actorEmail = actor.email;
    projectId = (await prisma.project.create({ data: { organizationId: orgId, name: "Imp", createdById: owner.id } })).id;
  });

  it("previews with auto-mapping and row-level validation, then commits atomically", async () => {
    const buf = await buildXlsx([
      { video: "Ep1", language: "Spanish", segment_external_id: "L1", start_ms: "00:00:01.000", end_ms: "00:00:03.000", script: "Hola", actor_email: actorEmail, due_date: "2026-12-01" },
      { video: "Ep1", language: "Spanish", segment_external_id: "L2", start_ms: 4000, end_ms: 6000, script: "Adiós", actor_email: "", due_date: "" },
      { video: "Ep1", language: "German", segment_external_id: "L1", start_ms: 1000, end_ms: 500, script: "Hallo", actor_email: "", due_date: "" },
    ]);
    const preview = await previewImport({ userId: owner.id, projectId, buffer: buf, filename: "lines.xlsx" });
    expect(preview.mapping.script).toBe("script");
    expect(preview.summary.total).toBe(3);
    expect(preview.summary.valid).toBe(2);
    expect(preview.rows[0].locale).toBe("es");
    expect(preview.rows[0].startMs).toBe(1000);
    expect(preview.rows[2].errors[0]).toMatch(/End time/);

    await expect(commitImport({ userId: owner.id, projectId, batchId: preview.batchId, mode: "all" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const result = await commitImport({ userId: owner.id, projectId, batchId: preview.batchId, mode: "valid_only" });
    expect(result.imported).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.assigned).toBe(1);
    expect(await prisma.segment.count({ where: { languageTrack: { video: { projectId } } } })).toBe(2);
    const assigned = await prisma.segment.findFirst({ where: { externalId: "L1" }, include: { assignments: true } });
    expect(assigned?.status).toBe("ASSIGNED");
    expect(assigned?.assignments[0].dueAt?.toISOString().slice(0, 10)).toBe("2026-12-01");
    await expect(commitImport({ userId: owner.id, projectId, batchId: preview.batchId, mode: "valid_only" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("is idempotent on external ids and never overwrites segments with recordings", async () => {
    const seg = await prisma.segment.findFirstOrThrow({ where: { externalId: "L2" } });
    await prisma.recordingVersion.create({ data: { segmentId: seg.id, versionNumber: 1, objectKey: `org/${orgId}/segments/${seg.id}/a.wav`, mimeType: "audio/wav", processingStatus: "READY" } });
    const buf = await buildXlsx([
      { video: "Ep1", language: "es", segment_external_id: "L1", start_ms: 1500, end_ms: 3500, script: "Hola (edited)" },
      { video: "Ep1", language: "es", segment_external_id: "L2", start_ms: 4000, end_ms: 6000, script: "Adiós (edited)" },
    ]);
    const preview = await previewImport({ userId: owner.id, projectId, buffer: buf, filename: "lines.xlsx" });
    const res = await commitImport({ userId: owner.id, projectId, batchId: preview.batchId, mode: "all" });
    expect(res.updated).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.imported).toBe(0);
    expect((await prisma.segment.findFirstOrThrow({ where: { externalId: "L1" } })).script).toBe("Hola (edited)");
    expect((await prisma.segment.findFirstOrThrow({ where: { externalId: "L2" } })).script).toBe("Adiós");
    expect(await prisma.segment.count({ where: { languageTrack: { video: { projectId } } } })).toBe(2);
  });

  it("refuses imports from editors", async () => {
    const editor = await addMember(orgId, "EDITOR");
    await expect(previewImport({ userId: editor.id, projectId, buffer: Buffer.from("video,language,script\n"), filename: "x.csv" })).rejects.toMatchObject({ status: 403 });
  });
});
