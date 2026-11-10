import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { getEnv } from "@/server/env";
import { getStorage } from "@/server/storage";
import { LocalStorageAdapter } from "@/server/storage/local";

/**
 * Serves the development-only local storage driver. URLs are HMAC-signed and short
 * lived; this route is a stand-in for an S3-compatible bucket and is disabled when
 * STORAGE_DRIVER=s3.
 */

function adapter(): LocalStorageAdapter | null {
  const storage = getStorage();
  return storage instanceof LocalStorageAdapter ? storage : null;
}

function keyFrom(params: { key: string[] }) {
  return params.key.map(decodeURIComponent).join("/");
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const local = adapter();
  if (!local) return new Response("Not found", { status: 404 });
  const key = keyFrom(await ctx.params);
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const ct = url.searchParams.get("ct") ?? "";
  const cl = Number(url.searchParams.get("cl"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!local.verify({ op: "put", key, exp, ct, cl, sig })) return new Response("Invalid or expired signature", { status: 403 });

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length !== cl) return new Response("Content length mismatch", { status: 400 });
  if (body.length > getEnv().MAX_UPLOAD_BYTES) return new Response("Payload too large", { status: 413 });

  const filePath = local.resolvePath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  await writeFile(filePath + ".meta", ct, "utf8");
  return new Response(null, { status: 200 });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const local = adapter();
  if (!local) return new Response("Not found", { status: 404 });
  const key = keyFrom(await ctx.params);
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!local.verify({ op: "get", key, exp, sig })) return new Response("Invalid or expired signature", { status: 403 });

  const filePath = local.resolvePath(key);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const meta = await local.headObject(key);
  const contentType = meta?.contentType || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, no-store",
  };
  const fn = url.searchParams.get("fn");
  if (fn) headers["Content-Disposition"] = `inline; filename="${encodeURIComponent(fn)}"`;

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start <= end && start < size) {
        headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
        headers["Content-Length"] = String(end - start + 1);
        const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
        return new Response(stream, { status: 206, headers });
      }
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
  }
  headers["Content-Length"] = String(size);
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
