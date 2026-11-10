import { describe, expect, it } from "vitest";
import { assertValidObjectKey } from "@/server/storage/types";
import { LocalStorageAdapter } from "@/server/storage/local";
import { extensionForMime } from "@/server/storage";

describe("object keys", () => {
  it("rejects traversal and odd characters", () => {
    expect(() => assertValidObjectKey("org/a/segments/b/c.wav")).not.toThrow();
    expect(() => assertValidObjectKey("../etc/passwd")).toThrow();
    expect(() => assertValidObjectKey("org//x")).toThrow();
    expect(() => assertValidObjectKey("org/x/../y")).toThrow();
    expect(() => assertValidObjectKey("/abs")).toThrow();
  });
  it("maps allowed mime types", () => {
    expect(extensionForMime("audio/wav")).toBe("wav");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("video/mp4")).toBeNull();
  });
});

describe("local storage signatures", () => {
  it("verifies signed URLs and rejects expired or tampered ones", async () => {
    const local = new LocalStorageAdapter();
    const up = await local.createUploadUrl({ key: "org/t/segments/s/a.wav", contentType: "audio/wav", contentLength: 10, ttlSeconds: 60 });
    const u = new URL(up.url);
    const params = { op: "put" as const, key: "org/t/segments/s/a.wav", exp: Number(u.searchParams.get("exp")), ct: "audio/wav", cl: 10, sig: u.searchParams.get("sig")! };
    expect(local.verify(params)).toBe(true);
    expect(local.verify({ ...params, cl: 11 })).toBe(false);
    expect(local.verify({ ...params, exp: Math.floor(Date.now() / 1000) - 10 })).toBe(false);
    expect(local.verify({ ...params, key: "org/t/segments/s/b.wav" })).toBe(false);
  });
});
