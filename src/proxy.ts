import { NextRequest, NextResponse } from "next/server";
const SESSION_COOKIE = "stocklab_session";
export function proxy(request: NextRequest) {
  if (
    process.env.AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  )
    return NextResponse.next();
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/opportunities/:path*",
    "/briefs/:path*",
    "/generation/:path*",
    "/provider-logs/:path*",
    "/review/:path*",
    "/exports/:path*",
    "/settings/:path*",
    "/api/exports/:path*",
    "/api/prompts/:path*",
    "/api/provider-logs/:path*",
    "/api/assets/:path*",
  ],
};
