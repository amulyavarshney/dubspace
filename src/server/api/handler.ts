import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { auth } from "@/server/auth/auth";
import { ApiError } from "@/server/errors";
import { logger } from "@/server/log";
import { checkRateLimit } from "@/server/api/rate-limit";

export type ApiUser = { id: string; email: string; name: string };

export type ApiContext<P = Record<string, string>> = {
  req: NextRequest;
  user: ApiUser;
  requestId: string;
  params: P;
};

type RouteCtx = { params: Promise<Record<string, string>> } | { params: Record<string, string> } | undefined;

export type HandlerOptions = {
  /** Rate limit: `{ limit, windowMs }` keyed by user id and route. */
  rateLimit?: { limit: number; windowMs: number; key?: string };
};

export function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof ApiError) {
    return Response.json(
      { code: err.code, message: err.message, requestId, ...(err.details ? { details: err.details } : {}) },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return Response.json(
      { code: "VALIDATION_ERROR", message: "Invalid request", requestId, details: err.issues },
      { status: 400 },
    );
  }
  logger.error("Unhandled API error", { requestId, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  return Response.json({ code: "INTERNAL_ERROR", message: "Something went wrong", requestId }, { status: 500 });
}

/**
 * Wraps a route handler with request id generation, authentication, rate limiting and
 * standard error mapping. All `/api/v1` handlers go through this.
 */
export function apiHandler<P = Record<string, string>>(
  fn: (ctx: ApiContext<P>) => Promise<Response>,
  options: HandlerOptions = {},
) {
  return async (req: NextRequest, routeCtx?: RouteCtx): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) throw ApiError.unauthenticated();
      const user: ApiUser = { id: session.user.id, email: session.user.email, name: session.user.name };

      if (options.rateLimit) {
        const key = `${options.rateLimit.key ?? new URL(req.url).pathname}:${user.id}`;
        if (!checkRateLimit(key, options.rateLimit.limit, options.rateLimit.windowMs)) throw ApiError.rateLimited();
      }

      const rawParams = routeCtx && "params" in routeCtx ? await routeCtx.params : {};
      const res = await fn({ req, user, requestId, params: rawParams as P });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw ApiError.validation("Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.validation("Invalid request body", parsed.error.issues);
  return parsed.data;
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (obj[k] = v));
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw ApiError.validation("Invalid query parameters", parsed.error.issues);
  return parsed.data;
}

export function ok(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}
