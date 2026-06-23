import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  pbkdf2Sync,
  pbkdf2,
} from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { env } from "./env";

export const ADMIN_USERNAME = env.ADMIN_USERNAME;
export const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

const pbkdf2Async = promisify(pbkdf2);
const ADMIN_PASSWORD_HASH = pbkdf2Sync(
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  100000,
  64,
  "sha512",
);

const ADMIN_SESSION_COOKIE = "argos_admin_session";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_IMPERSONATION_TTL_MS = 60 * 1000;
const ADMIN_IMPERSONATION_PREFIX = "argos_imp";

function secureCompare(a: string, b: string): boolean {
  const aHmac = createHmac("sha256", env.ADMIN_COOKIE_SECRET)
    .update(a)
    .digest();
  const bHmac = createHmac("sha256", env.ADMIN_COOKIE_SECRET)
    .update(b)
    .digest();
  return timingSafeEqual(aHmac, bHmac);
}

function sign(payload: string): string {
  return createHmac("sha256", env.ADMIN_COOKIE_SECRET)
    .update(payload)
    .digest("base64url");
}

export async function verifyAdminCredentials(input: {
  username: string;
  password: string;
}): Promise<boolean> {
  if (input.username !== ADMIN_USERNAME) return false;

  const hash = await pbkdf2Async(
    input.password,
    ADMIN_USERNAME,
    100000,
    64,
    "sha512",
  );
  return timingSafeEqual(hash, ADMIN_PASSWORD_HASH);
}

export function createAdminSessionCookieValue(): string {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${ADMIN_USERNAME}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  };
}

export function expiredAdminCookieOptions() {
  return {
    ...adminCookieOptions(),
    maxAge: 0,
  };
}

export function verifyAdminSessionCookie(value: string | undefined): boolean {
  if (!value) return false;

  const parts = value.split(".");
  if (parts.length !== 4) return false;

  const [username, expiresAtRaw, nonce, signature] = parts;
  const payload = `${username}.${expiresAtRaw}.${nonce}`;
  if (!secureCompare(signature, sign(payload))) return false;
  if (username !== ADMIN_USERNAME) return false;

  const expiresAt = Number(expiresAtRaw);
  return Number.isFinite(expiresAt) && Date.now() <= expiresAt;
}

export async function hasAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminSessionCookie(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (verifyAdminSessionCookie(req.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function createAdminImpersonationToken(userId: string): string {
  const expiresAt = Date.now() + ADMIN_IMPERSONATION_TTL_MS;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${ADMIN_IMPERSONATION_PREFIX}.${userId}.${expiresAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminImpersonationToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;

  const [prefix, userId, expiresAtRaw, nonce, signature] = parts;
  const payload = `${prefix}.${userId}.${expiresAtRaw}.${nonce}`;
  if (prefix !== ADMIN_IMPERSONATION_PREFIX) return null;
  if (!secureCompare(signature, sign(payload))) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return userId;
}

export { ADMIN_SESSION_COOKIE };
