type Level = "debug" | "info" | "warn" | "error";

const SECRET_PATTERNS = [/sk_[a-zA-Z0-9_]{8,}/g, /xi-api-key["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, /Bearer\s+[A-Za-z0-9._-]+/g];

export function redact(input: unknown): unknown {
  if (typeof input === "string") {
    return SECRET_PATTERNS.reduce((s, re) => s.replace(re, "[REDACTED]"), input);
  }
  if (Array.isArray(input)) return input.map(redact);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/secret|password|apikey|api_key|token|authorization|encrypted/i.test(k)) out[k] = "[REDACTED]";
      else out[k] = redact(v);
    }
    return out;
  }
  return input;
}

export function log(level: Level, message: string, meta: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...(redact(meta) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => log("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log("error", m, meta),
};
