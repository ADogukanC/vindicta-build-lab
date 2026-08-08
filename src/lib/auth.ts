import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "vbl_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret(): Uint8Array {
  const raw =
    process.env.ADMIN_SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-only-insecure-secret");
  if (!raw) {
    throw new Error("ADMIN_SESSION_SECRET must be set in production.");
  }
  return new TextEncoder().encode(raw.padEnd(32, "."));
}

function expectedPassword(): string {
  const raw = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "admin");
  if (!raw) {
    throw new Error("ADMIN_PASSWORD must be set in production.");
  }
  return raw;
}

/** Constant-time-ish comparison so a wrong password does not leak its length. */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function checkPassword(candidate: string): boolean {
  return safeEqual(candidate, expectedPassword());
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/** Throws a 401-shaped error for API routes. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Response(JSON.stringify({ error: "Not authorised" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
}
