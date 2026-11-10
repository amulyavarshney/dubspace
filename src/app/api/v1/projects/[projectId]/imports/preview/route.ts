import { z } from "zod";
import { apiHandler, ok } from "@/server/api/handler";
import { ApiError } from "@/server/errors";
import { IMPORT_FIELDS, previewImport, type ColumnMapping } from "@/server/services/imports";

const mappingSchema = z.partialRecord(z.enum(IMPORT_FIELDS), z.string().max(200));

export const POST = apiHandler<{ projectId: string }>(
  async ({ req, user, params }) => {
    const form = await req.formData().catch(() => null);
    if (!form) throw ApiError.validation("Expected multipart form data");
    const file = form.get("file");
    if (!(file instanceof File)) throw ApiError.validation("Attach a spreadsheet file");
    const sheet = typeof form.get("sheet") === "string" ? (form.get("sheet") as string) : undefined;
    let mapping: ColumnMapping | undefined;
    const rawMapping = form.get("mapping");
    if (typeof rawMapping === "string" && rawMapping) {
      const parsed = mappingSchema.safeParse(JSON.parse(rawMapping));
      if (!parsed.success) throw ApiError.validation("Invalid column mapping", parsed.error.issues);
      mapping = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v)) as ColumnMapping;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return ok(await previewImport({ userId: user.id, projectId: params.projectId, buffer, filename: file.name, sheet, mapping }));
  },
  { rateLimit: { limit: 30, windowMs: 60_000 } },
);
