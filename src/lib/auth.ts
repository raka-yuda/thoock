import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "stocklab_session";
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required.");
  return new TextEncoder().encode(value);
}
export async function createSessionToken(user: { id: string; email: string }) {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}
export async function readSession() {
  if (
    process.env.AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  )
    return { id: "development-owner", email: "owner@stocklab.local" };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret());
    return { id: verified.payload.sub!, email: String(verified.payload.email) };
  } catch {
    return null;
  }
}
export async function requireSession() {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}
