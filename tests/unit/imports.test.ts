import { describe, expect, it } from "vitest";
import { parseSpreadsheet, parseTimestampMs, suggestMapping, validateRows } from "@/server/services/imports";
import { normalizeLocale } from "@/lib/locale";

describe("timestamp parsing", () => {
  it("accepts ms, seconds, mm:ss and hh:mm:ss.mmm", () => {
    expect(parseTimestampMs("2500")).toBe(2500);
    expect(parseTimestampMs("2.5")).toBe(2500);
    expect(parseTimestampMs("00:02")).toBe(2000);
    expect(parseTimestampMs("01:02:03.250")).toBe(3723250);
    expect(parseTimestampMs("garbage")).toBeNull();
  });
});

describe("locale normalization", () => {
  it("maps names and tags to BCP 47", () => {
    expect(normalizeLocale("Spanish")).toBe("es");
    expect(normalizeLocale("pt_br")).toBe("pt-BR");
    expect(normalizeLocale("ES-419")).toBe("es-419");
    expect(normalizeLocale("Klingonese")).toBeNull();
  });
});

describe("spreadsheet import validation", () => {
  const headers = ["Video", "Language", "Line ID", "Start", "End", "Text", "Actor", "Due"];
  it("suggests a mapping from header synonyms", () => {
    const m = suggestMapping(headers);
    expect(m.video).toBe("Video");
    expect(m.language).toBe("Language");
    expect(m.segment_external_id).toBe("Line ID");
    expect(m.start_ms).toBe("Start");
    expect(m.end_ms).toBe("End");
    expect(m.script).toBe("Text");
    expect(m.actor_email).toBe("Actor");
    expect(m.due_date).toBe("Due");
  });
  it("rejects negative and inverted timestamps, duplicates and unknown languages", () => {
    const m = suggestMapping(headers);
    const rows = validateRows(
      [
        { Video: "Ep1", Language: "es", "Line ID": "1", Start: "0", End: "1000", Text: "ok", Actor: "a@b.co", Due: "2026-01-01" },
        { Video: "Ep1", Language: "es", "Line ID": "2", Start: "-5", End: "1000", Text: "neg", Actor: "", Due: "" },
        { Video: "Ep1", Language: "es", "Line ID": "3", Start: "2000", End: "1000", Text: "inverted", Actor: "", Due: "" },
        { Video: "Ep1", Language: "es", "Line ID": "1", Start: "0", End: "1000", Text: "dup", Actor: "", Due: "" },
        { Video: "Ep1", Language: "Elvish", "Line ID": "4", Start: "0", End: "1000", Text: "lang", Actor: "", Due: "" },
        { Video: "", Language: "es", "Line ID": "5", Start: "0", End: "1000", Text: "", Actor: "", Due: "" },
      ],
      m,
      new Set(["a@b.co"]),
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
    expect(rows[1].errors.join(" ")).toMatch(/Negative/);
    expect(rows[2].errors.join(" ")).toMatch(/End time must be after/);
    expect(rows[3].errors.join(" ")).toMatch(/Duplicate/);
    expect(rows[4].errors.join(" ")).toMatch(/Unrecognised language/);
    expect(rows[5].errors).toEqual(expect.arrayContaining([expect.stringMatching(/Missing video/), expect.stringMatching(/Missing script/)]));
  });
  it("warns for unknown actors instead of failing the row", () => {
    const m = suggestMapping(headers);
    const rows = validateRows([{ Video: "Ep1", Language: "de", "Line ID": "1", Start: "0", End: "1000", Text: "x", Actor: "nobody@x.co", Due: "" }], m, new Set());
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings[0]).toMatch(/not a member/);
  });
  it("parses CSV with a BOM", async () => {
    const csv = Buffer.from("﻿video,language,script,start_ms,end_ms\nEp1,es,Hola,0,1000\n", "utf8");
    const sheets = await parseSpreadsheet(csv, "x.csv");
    expect(sheets[0].headers).toEqual(["video", "language", "script", "start_ms", "end_ms"]);
    expect(sheets[0].rows[0].script).toBe("Hola");
  });
});
