import crypto from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, userSessionsTable, usersTable } from "@workspace/db";

const argon2Async = promisify(crypto.argon2);

const ARGON2_MEMORY_KIB = 19456;
const ARGON2_PASSES = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_TAG_LENGTH = 32;

export async function hashPassword(plaintext: string): Promise<string> {
  const nonce = crypto.randomBytes(16);
  const derived = await argon2Async("argon2id", {
    message: Buffer.from(plaintext, "utf8"),
    nonce,
    parallelism: ARGON2_PARALLELISM,
    tagLength: ARGON2_TAG_LENGTH,
    memory: ARGON2_MEMORY_KIB,
    passes: ARGON2_PASSES,
  });
  return `$argon2id$m=${ARGON2_MEMORY_KIB},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISM}$${nonce.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(plaintext: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  // Expected: ['', 'argon2id', 'm=...,t=...,p=...', '<salt>', '<hash>']
  if (parts.length !== 5 || parts[1] !== "argon2id") return false;
  const params = Object.fromEntries(
    (parts[2] ?? "").split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, Number(v)];
    }),
  );
  const nonce = Buffer.from(parts[3] ?? "", "base64");
  const expected = Buffer.from(parts[4] ?? "", "base64");
  if (!nonce.length || !expected.length) return false;
  const derived = await argon2Async("argon2id", {
    message: Buffer.from(plaintext, "utf8"),
    nonce,
    parallelism: params.p || ARGON2_PARALLELISM,
    tagLength: expected.length,
    memory: params.m || ARGON2_MEMORY_KIB,
    passes: params.t || ARGON2_PASSES,
  });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateCsrfSecret(): string {
  return crypto.randomBytes(16).toString("hex");
}

export interface DemoAuthUser {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  employeeId: string | null;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
}

export interface DemoSession {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  csrfSecret: string;
  mfaVerified: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
}

const DEMO_USERS_CACHE: DemoAuthUser[] = [];
const DEMO_SESSIONS_CACHE: DemoSession[] = [];
let demoUsersInitialized = false;

export async function ensureDemoAuthUsersSeeded(): Promise<DemoAuthUser[]> {
  if (!demoUsersInitialized) {
    demoUsersInitialized = true;
    const defaultPass = process.env.DEMO_USER_PASSWORD || "RekkerDemo!2026";
    const defaultHash = await hashPassword(defaultPass);
    DEMO_USERS_CACHE.push(
      {
        id: "user_demo_admin_01",
        organizationId: "rekker-demo",
        email: "demo.hradmin@rekker-demo.invalid",
        passwordHash: defaultHash,
        fullName: "David Kibet",
        role: "hr_admin",
        employeeId: "10000000-0000-4000-8000-000000000007",
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      {
        id: "user_demo_manager_01",
        organizationId: "rekker-demo",
        email: "demo.manager@rekker-demo.invalid",
        passwordHash: defaultHash,
        fullName: "Achieng Odhiambo",
        role: "department_manager",
        employeeId: "10000000-0000-4000-8000-000000000001",
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
      {
        id: "user_demo_employee_01",
        organizationId: "rekker-demo",
        email: "demo.employee@rekker-demo.invalid",
        passwordHash: defaultHash,
        fullName: "Mwangi Kariuki",
        role: "employee",
        employeeId: "10000000-0000-4000-8000-000000000002",
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    );
  }
  return DEMO_USERS_CACHE;
}

export interface ResolvedSessionContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  role: string;
  employeeId: string | null;
  fullName: string;
  email: string;
  mfaVerified: boolean;
  csrfSecret: string;
}

export async function resolveSessionFromToken(
  rawToken: string | undefined,
): Promise<ResolvedSessionContext | null> {
  if (!rawToken || rawToken.length < 32) return null;
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  if (!process.env.DATABASE_URL) {
    await ensureDemoAuthUsersSeeded();
    const sess = DEMO_SESSIONS_CACHE.find(
      (s) => s.tokenHash === tokenHash && !s.revokedAt && s.expiresAt > now,
    );
    if (!sess) return null;
    const user = DEMO_USERS_CACHE.find((u) => u.id === sess.userId && u.isActive);
    if (!user) return null;
    return {
      sessionId: sess.id,
      userId: user.id,
      organizationId: sess.organizationId,
      role: user.role,
      employeeId: user.employeeId,
      fullName: user.fullName,
      email: user.email,
      mfaVerified: sess.mfaVerified,
      csrfSecret: sess.csrfSecret,
    };
  }

  const [row] = await db
    .select({
      sessionId: userSessionsTable.id,
      userId: usersTable.id,
      organizationId: userSessionsTable.organizationId,
      role: usersTable.role,
      employeeId: usersTable.employeeId,
      fullName: usersTable.fullName,
      email: usersTable.email,
      mfaVerified: userSessionsTable.mfaVerified,
      csrfSecret: userSessionsTable.csrfSecret,
    })
    .from(userSessionsTable)
    .innerJoin(usersTable, eq(userSessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(userSessionsTable.tokenHash, tokenHash),
        isNull(userSessionsTable.revokedAt),
        gt(userSessionsTable.expiresAt, now),
        eq(usersTable.isActive, true),
        isNull(usersTable.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function createAuthSession(params: {
  userId: string;
  organizationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  mfaVerified?: boolean;
}): Promise<{ rawToken: string; csrfSecret: string; expiresAt: Date }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const csrfSecret = generateCsrfSecret();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours

  if (!process.env.DATABASE_URL) {
    DEMO_SESSIONS_CACHE.push({
      id: crypto.randomUUID(),
      userId: params.userId,
      organizationId: params.organizationId,
      tokenHash,
      csrfSecret,
      mfaVerified: Boolean(params.mfaVerified),
      expiresAt,
      revokedAt: null,
    });
    return { rawToken, csrfSecret, expiresAt };
  }

  await db.insert(userSessionsTable).values({
    userId: params.userId,
    organizationId: params.organizationId,
    tokenHash,
    csrfSecret,
    mfaVerified: Boolean(params.mfaVerified),
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    expiresAt,
  });

  return { rawToken, csrfSecret, expiresAt };
}

export async function revokeAuthSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  if (!process.env.DATABASE_URL) {
    const sess = DEMO_SESSIONS_CACHE.find((s) => s.tokenHash === tokenHash);
    if (sess) sess.revokedAt = new Date();
    return;
  }
  await db
    .update(userSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(userSessionsTable.tokenHash, tokenHash));
}
