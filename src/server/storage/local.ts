import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/server/env";
import { constantTimeEqual } from "@/server/crypto/secrets";
import { assertValidObjectKey, type StorageAdapter, type UploadTarget } from "./types";

/**
 * Development storage: writes objects to a local directory and issues short-lived
 * HMAC-signed URLs served by `/api/v1/local-storage/[...key]`. Never use in production.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly driver = "local" as const;
  private readonly root: string;
  private readonly secret: string;
  private readonly baseUrl: string;

  constructor() {
    const env = getEnv();
    this.root = path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);
    this.secret = env.LOCAL_STORAGE_SIGNING_SECRET ?? env.AUTH_SECRET;
    this.baseUrl = env.APP_BASE_URL.replace(/\/$/, "");
  }

  private filePath(key: string) {
    assertValidObjectKey(key);
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid object key");
    return p;
  }

  sign(params: { op: "put" | "get"; key: string; exp: number; ct?: string; cl?: number }): string {
    const payload = [params.op, params.key, params.exp, params.ct ?? "", params.cl ?? ""].join("\n");
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }

  verify(params: { op: "put" | "get"; key: string; exp: number; ct?: string; cl?: number; sig: string }): boolean {
    if (!Number.isFinite(params.exp) || params.exp * 1000 < Date.now()) return false;
    return constantTimeEqual(this.sign(params), params.sig);
  }

  async createUploadUrl(input: { key: string; contentType: string; contentLength: number; ttlSeconds: number }): Promise<UploadTarget> {
    assertValidObjectKey(input.key);
    const exp = Math.floor(Date.now() / 1000) + input.ttlSeconds;
    const sig = this.sign({ op: "put", key: input.key, exp, ct: input.contentType, cl: input.contentLength });
    const qs = new URLSearchParams({ op: "put", exp: String(exp), ct: input.contentType, cl: String(input.contentLength), sig });
    return {
      url: `${this.baseUrl}/api/v1/local-storage/${input.key}?${qs}`,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async createDownloadUrl(input: { key: string; ttlSeconds: number; filename?: string; contentType?: string }): Promise<string> {
    assertValidObjectKey(input.key);
    const exp = Math.floor(Date.now() / 1000) + input.ttlSeconds;
    const sig = this.sign({ op: "get", key: input.key, exp });
    const qs = new URLSearchParams({ op: "get", exp: String(exp), sig });
    if (input.filename) qs.set("fn", input.filename);
    return `${this.baseUrl}/api/v1/local-storage/${input.key}?${qs}`;
  }

  async headObject(key: string) {
    try {
      const s = await stat(this.filePath(key));
      let contentType: string | null = null;
      try {
        contentType = (await readFile(this.filePath(key) + ".meta", "utf8")).trim() || null;
      } catch {
        /* no meta */
      }
      return { size: s.size, contentType };
    } catch {
      return null;
    }
  }

  async getObject(key: string) {
    return readFile(this.filePath(key));
  }

  async putObject(key: string, body: Uint8Array, contentType: string) {
    const p = this.filePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
    await writeFile(p + ".meta", contentType, "utf8");
  }

  async deleteObject(key: string) {
    const p = this.filePath(key);
    await rm(p, { force: true });
    await rm(p + ".meta", { force: true });
  }

  /** Absolute path for streaming reads in the local-storage route. */
  resolvePath(key: string) {
    return this.filePath(key);
  }
}
