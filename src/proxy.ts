import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/invite", "/api/auth", "/api/v1/local-storage"];

/**
 * Lightweight redirect for signed-out visitors. Real authorization is enforced in
 * layouts, server components and every API handler; this only improves UX.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith("session_token"));
  if (!hasSession && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)"],
};
