import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit, emitOutbox } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { requireProjectAccess } from "@/server/authorization/access";
import { displayLanguageName, normalizeLocale } from "@/lib/locale";
import { createNotification } from "./notifications";

export const IMPORT_FIELDS = ["video", "language", "segment_external_id", "start_ms", "end_ms", "script", "actor_email", "due_date", "notes", "required"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, string>>;

const SYNONYMS: Record<ImportField, string[]> = {
  video: ["video", "video title", "file", "episode", "clip", "source"],
  language: ["language", "locale", "lang", "target language", "target"],
  segment_external_id: ["segment_external_id", "segment id", "id", "line id", "external id", "line", "cue", "segment"],
  start_ms: ["start_ms", "start", "start time", "in", "tc in", "start (ms)"],
  end_ms: ["end_ms", "end", "end time", "out", "tc out", "end (ms)"],
  script: ["script", "text", "line text", "dialogue", "translation", "transcript"],
  actor_email: ["actor_email", "actor", "voice actor", "assignee", "email", "talent"],
  due_date: ["due_date", "due", "deadline", "due date"],
  notes: ["notes", "note", "comment", "direction", "remarks"],
  required: ["required", "mandatory", "deliverable"],
};

export type ParsedSheet = { name: string; headers: string[]; rows: Record<string, string>[] };

export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSheet[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    if (parsed.errors.some((e) => e.type === "Delimiter")) throw ApiError.validation("Could not detect CSV delimiter");
    const headers = parsed.meta.fields ?? [];
    return [{ name: "CSV", headers, rows: parsed.data.map((r) => Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "").trim()]))) }];
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheets: ParsedSheet[] = [];
    wb.eachSheet((ws) => {
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
        headers[col - 1] = cellText(cell.value).trim() || `Column ${col}`;
      });
      const rows: Record<string, string>[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj: Record<string, string> = {};
        let any = false;
        headers.forEach((h, i) => {
          const v = cellText(row.getCell(i + 1).value).trim();
          if (v) any = true;
          obj[h] = v;
        });
        if (any) rows.push(obj);
      });
      if (headers.length) sheets.push({ name: ws.name, headers, rows });
    });
    if (!sheets.length) throw ApiError.validation("Workbook has no sheets with a header row");
    return sheets;
  }
  throw ApiError.validation("Unsupported file type. Upload .xlsx or .csv");
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("hyperlink" in v) return String(v.hyperlink);
    return "";
  }
  return String(v);
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const match = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(h.trim().toLowerCase()));
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

/** Accepts milliseconds, seconds with decimals, `mm:ss`, `hh:mm:ss`, `hh:mm:ss.mmm` or `hh:mm:ss:ff`. */
export function parseTimestampMs(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Math.round(Number(s) * 1000);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s);
  if (m) {
    const h = m[1] ? Number(m[1]) : 0;
    const ms = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
    return ((h * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + ms;
  }
  const smpte = /^(\d+):(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (smpte) return ((Number(smpte[1]) * 60 + Number(smpte[2])) * 60 + Number(smpte[3])) * 1000 + Math.round((Number(smpte[4]) / 25) * 1000);
  return null;
}

export type ValidatedRow = {
  rowNumber: number;
  video: string;
  locale: string | null;
  languageLabel: string;
  externalId: string | null;
  startMs: number | null;
  endMs: number | null;
  script: string;
  actorEmail: string | null;
  dueAt: string | null;
  notes: string | null;
  required: boolean;
  errors: string[];
  warnings: string[];
};

export function validateRows(rows: Record<string, string>[], mapping: ColumnMapping, knownEmails: Set<string>): ValidatedRow[] {
  const get = (r: Record<string, string>, f: ImportField) => (mapping[f] ? (r[mapping[f]!] ?? "").trim() : "");
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const video = get(r, "video");
    const languageLabel = get(r, "language");
    const locale = normalizeLocale(languageLabel);
    const externalId = get(r, "segment_external_id") || null;
    const startRaw = get(r, "start_ms");
    const endRaw = get(r, "end_ms");
    const startMs = parseTimestampMs(startRaw);
    const endMs = parseTimestampMs(endRaw);
    const script = get(r, "script");
    const actorEmail = get(r, "actor_email").toLowerCase() || null;
    const dueRaw = get(r, "due_date");
    const notes = get(r, "notes") || null;
    const requiredRaw = get(r, "required").toLowerCase();
    const required = requiredRaw ? !["no", "false", "0", "optional", "n"].includes(requiredRaw) : true;

    if (!video) errors.push("Missing video");
    if (!languageLabel) errors.push("Missing language");
    else if (!locale) errors.push(`Unrecognised language "${languageLabel}"`);
    if (startRaw && startMs === null) errors.push(`Invalid start time "${startRaw}"`);
    if (endRaw && endMs === null) errors.push(`Invalid end time "${endRaw}"`);
    if (startMs !== null && startMs < 0) errors.push("Negative start time");
    if (endMs !== null && endMs < 0) errors.push("Negative end time");
    if (startMs !== null && endMs !== null && endMs <= startMs) errors.push("End time must be after start time");
    if (!startRaw && !endRaw && !externalId) errors.push("Row needs a segment id or start/end times");
    if (!script) errors.push("Missing script");
    let dueAt: string | null = null;
    if (dueRaw) {
      const d = new Date(dueRaw);
      if (Number.isNaN(d.getTime())) errors.push(`Invalid due date "${dueRaw}"`);
      else dueAt = d.toISOString();
    }
    if (actorEmail) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(actorEmail)) errors.push(`Invalid actor email "${actorEmail}"`);
      else if (!knownEmails.has(actorEmail)) warnings.push(`Actor ${actorEmail} is not a member of this organization; segment will be left unassigned`);
    }
    if (externalId && locale && video) {
      const key = `${video}\u0000${locale}\u0000${externalId}`;
      if (seen.has(key)) errors.push(`Duplicate segment id "${externalId}" for ${video}/${locale} in this file`);
      seen.add(key);
    }
    return { rowNumber: i + 2, video, locale, languageLabel, externalId, startMs: startMs ?? 0, endMs: endMs ?? (startMs ?? 0) + 1, script, actorEmail, dueAt, notes, required, errors, warnings };
  });
}

export type ImportPreview = {
  batchId: string;
  filename: string;
  sheets: Array<{ name: string; headers: string[]; rowCount: number }>;
  sheet: string;
  headers: string[];
  mapping: ColumnMapping;
  rows: ValidatedRow[];
  summary: { total: number; valid: number; invalid: number; warnings: number };
};

export async function previewImport(input: { userId: string; projectId: string; buffer: Buffer; filename: string; sheet?: string; mapping?: ColumnMapping }): Promise<ImportPreview> {
  const access = await requireProjectAccess(input.userId, input.projectId, "FULL");
  if (input.buffer.length > 20 * 1024 * 1024) throw ApiError.validation("Spreadsheet is too large (20 MB max)");
  const sheets = await parseSpreadsheet(input.buffer, input.filename);
  const sheet = sheets.find((s) => s.name === input.sheet) ?? sheets[0];
  const mapping = input.mapping && Object.keys(input.mapping).length ? input.mapping : suggestMapping(sheet.headers);
  const members = await prisma.organizationMember.findMany({ where: { organizationId: access.organizationId }, select: { user: { select: { email: true } } } });
  const knownEmails = new Set(members.map((m) => m.user.email.toLowerCase()));
  const rows = validateRows(sheet.rows, mapping, knownEmails);
  const valid = rows.filter((r) => r.errors.length === 0).length;
  const batch = await prisma.importBatch.create({
    data: {
      projectId: input.projectId,
      importerId: input.userId,
      filename: input.filename.slice(0, 200),
      status: "PREVIEWED",
      mapping: { sheet: sheet.name, mapping, rows } as unknown as Prisma.InputJsonValue,
    },
  });
  await recordAudit(prisma, { organizationId: access.organizationId, actorId: input.userId, action: "import.previewed", entityType: "ImportBatch", entityId: batch.id, metadata: { projectId: input.projectId, filename: input.filename, total: rows.length, valid } });
  return {
    batchId: batch.id,
    filename: input.filename,
    sheets: sheets.map((s) => ({ name: s.name, headers: s.headers, rowCount: s.rows.length })),
    sheet: sheet.name,
    headers: sheet.headers,
    mapping,
    rows,
    summary: { total: rows.length, valid, invalid: rows.length - valid, warnings: rows.filter((r) => r.warnings.length).length },
  };
}

export type CommitResult = { batchId: string; imported: number; updated: number; skipped: number; rejected: number; assigned: number; messages: string[] };

export async function commitImport(input: { userId: string; projectId: string; batchId: string; mode: "all" | "valid_only" }): Promise<CommitResult> {
  const access = await requireProjectAccess(input.userId, input.projectId, "FULL");
  const batch = await prisma.importBatch.findFirst({ where: { id: input.batchId, projectId: input.projectId } });
  if (!batch) throw ApiError.notFound("Import preview not found");
  if (batch.status === "COMMITTED") throw ApiError.invalidState("This import has already been committed");
  const stored = batch.mapping as unknown as { rows: ValidatedRow[] } | null;
  const rows = stored?.rows ?? [];
  const invalid = rows.filter((r) => r.errors.length > 0);
  if (invalid.length && input.mode === "all") throw ApiError.validation(`${invalid.length} rows have errors. Fix them or import valid rows only.`, { invalidRows: invalid.map((r) => r.rowNumber) });
  const valid = rows.filter((r) => r.errors.length === 0);

  const members = await prisma.organizationMember.findMany({ where: { organizationId: access.organizationId }, select: { user: { select: { id: true, email: true } } } });
  const userByEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.user.id]));

  const result: CommitResult = { batchId: batch.id, imported: 0, updated: 0, skipped: 0, rejected: invalid.length, assigned: 0, messages: [] };
  await prisma.$transaction(async (tx) => {
    const videoCache = new Map<string, string>();
    const trackCache = new Map<string, string>();
    for (const row of valid) {
      let videoId = videoCache.get(row.video);
      if (!videoId) {
        const count = await tx.video.count({ where: { projectId: input.projectId } });
        const v = await tx.video.upsert({ where: { projectId_title: { projectId: input.projectId, title: row.video } }, update: {}, create: { projectId: input.projectId, title: row.video, sortOrder: count } });
        videoId = v.id;
        videoCache.set(row.video, videoId);
      }
      const locale = row.locale!;
      const trackKey = `${videoId}:${locale}`;
      let trackId = trackCache.get(trackKey);
      if (!trackId) {
        const t = await tx.languageTrack.upsert({ where: { videoId_locale: { videoId, locale } }, update: {}, create: { videoId, locale, displayName: displayLanguageName(locale) } });
        trackId = t.id;
        trackCache.set(trackKey, trackId);
      }
      const existing = row.externalId ? await tx.segment.findUnique({ where: { languageTrackId_externalId: { languageTrackId: trackId, externalId: row.externalId } }, include: { _count: { select: { versions: true } } } }) : null;
      let segmentId: string;
      if (existing) {
        if (existing._count.versions > 0 || existing.status === "APPROVED") {
          result.skipped++;
          result.messages.push(`Row ${row.rowNumber}: segment ${row.externalId} already has recordings or approvals and was not overwritten`);
          continue;
        }
        await tx.segment.update({ where: { id: existing.id }, data: { startMs: row.startMs!, endMs: row.endMs!, script: row.script, notes: row.notes, required: row.required, revision: { increment: 1 } } });
        segmentId = existing.id;
        result.updated++;
      } else {
        const seg = await tx.segment.create({ data: { languageTrackId: trackId, externalId: row.externalId, startMs: row.startMs!, endMs: row.endMs!, script: row.script, notes: row.notes, required: row.required } });
        segmentId = seg.id;
        result.imported++;
      }
      if (row.actorEmail) {
        const actorId = userByEmail.get(row.actorEmail);
        if (actorId) {
          const active = await tx.assignment.findFirst({ where: { segmentId, active: true } });
          if (!active || active.actorUserId !== actorId) {
            await tx.assignment.updateMany({ where: { segmentId, active: true }, data: { active: false, deactivatedAt: new Date() } });
            await tx.assignment.create({ data: { segmentId, actorUserId: actorId, dueAt: row.dueAt ? new Date(row.dueAt) : null, assignedById: input.userId } });
            await tx.projectMember.upsert({ where: { projectId_userId: { projectId: input.projectId, userId: actorId } }, update: {}, create: { projectId: input.projectId, userId: actorId, role: "ACTOR" } });
            await tx.segment.updateMany({ where: { id: segmentId, status: "UNASSIGNED" }, data: { status: "ASSIGNED" } });
            await createNotification(tx, { userId: actorId, type: "ASSIGNMENT_CREATED", title: "New recording assignment", body: row.script.slice(0, 140), resourceType: "Segment", resourceId: segmentId, href: `/projects/${input.projectId}/segments/${segmentId}` });
            result.assigned++;
          } else if (row.dueAt && active.dueAt?.toISOString() !== row.dueAt) {
            await tx.assignment.update({ where: { id: active.id }, data: { dueAt: new Date(row.dueAt) } });
          }
        }
      }
    }
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "COMMITTED", importedCount: result.imported + result.updated, rejectedCount: result.rejected, mapping: { committedAt: new Date().toISOString(), mode: input.mode } as Prisma.InputJsonValue } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: input.userId, action: "import.committed", entityType: "ImportBatch", entityId: batch.id, metadata: { projectId: input.projectId, filename: batch.filename, ...result, messages: undefined } });
    await emitOutbox(tx, "import_committed", batch.id, { projectId: input.projectId, imported: result.imported, updated: result.updated });
  });
  return result;
}
