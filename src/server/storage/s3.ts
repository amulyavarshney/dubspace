import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/server/env";
import { assertValidObjectKey, type StorageAdapter, type UploadTarget } from "./types";

export class S3StorageAdapter implements StorageAdapter {
  readonly driver = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const env = getEnv();
    if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async createUploadUrl(input: { key: string; contentType: string; contentLength: number; ttlSeconds: number }): Promise<UploadTarget> {
    assertValidObjectKey(input.key);
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: input.ttlSeconds });
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(input: { key: string; ttlSeconds: number; filename?: string; contentType?: string }): Promise<string> {
    assertValidObjectKey(input.key);
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: input.filename ? `inline; filename="${encodeURIComponent(input.filename)}"` : undefined,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: input.ttlSeconds });
  }

  async headObject(key: string) {
    assertValidObjectKey(key);
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err) {
      if ((err as { name?: string }).name === "NotFound" || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async getObject(key: string) {
    assertValidObjectKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async putObject(key: string, body: Uint8Array, contentType: string) {
    assertValidObjectKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async deleteObject(key: string) {
    assertValidObjectKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
