import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";

async function post(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!password || password.length > 256)
    return NextResponse.json(
      { error: "Enter your password." },
      { status: 400 },
    );
  let user: { id: string; email: string; passwordHash: string } | undefined;
  if (process.env.DATABASE_URL && email)
    user = await getDb().query.users.findFirst({
      where: eq(users.email, email),
    });
  else if (process.env.DATABASE_URL)
    user = await getDb().query.users.findFirst();
  else if (
    (!email || process.env.APP_USER_EMAIL === email) &&
    process.env.APP_PASSWORD_HASH
  )
    user = {
      id: "environment-owner",
      email: process.env.APP_USER_EMAIL!,
      passwordHash: process.env.APP_PASSWORD_HASH,
    };
  if (!user || !(await compare(password, user.passwordHash)))
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 },
    );
  const token = await createSessionToken(user);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export const POST = withApiLogging(post);
