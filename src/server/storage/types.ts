export type UploadTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type ObjectMeta = { size: number; contentType?: string | null };

export interface StorageAdapter {
  readonly driver: "local" | "s3";
  createUploadUrl(input: { key: string; contentType: string; contentLength: number; ttlSeconds: number }): Promise<UploadTarget>;
  createDownloadUrl(input: { key: string; ttlSeconds: number; filename?: string; contentType?: string }): Promise<string>;
  headObject(key: string): Promise<ObjectMeta | null>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,511}$/;

/** Object keys are server-generated and opaque; this guards against traversal anyway. */
export function assertValidObjectKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Invalid object key");
  }
}
