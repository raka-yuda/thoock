import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";

async function post() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return response;
}

export const POST = withApiLogging(post);
