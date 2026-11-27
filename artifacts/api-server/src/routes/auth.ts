import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { recordAuditEvent } from "../lib/auditService";
import {
  createAuthSession,
  ensureDemoAuthUsersSeeded,
  hashPassword,
  hashToken,
  resolveSessionFromToken,
  revokeAuthSession,
  verifyPassword,
} from "../lib/authService";
import { createRateLimiter } from "../lib/security";

const router: IRouter = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export const SESSION_COOKIE_NAME = "peopleos_sid";
export const CSRF_COOKIE_NAME = "peopleos_csrf";

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (typeof header !== "string") return undefined;
  const prefix = `${name}=`;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

const loginLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 15,
  keyPrefix: "auth_login",
});

router.post("/auth/login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const orgId =
    typeof req.body?.organizationId === "string" && req.body.organizationId.trim()
      ? req.body.organizationId.trim()
      : process.env.PEOPLEOS_ORGANIZATION_ID || "rekker-demo";

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const now = new Date();

  if (!process.env.DATABASE_URL) {
    const users = await ensureDemoAuthUsersSeeded();
    const user = users.find((u) => u.organizationId === orgId && u.email.toLowerCase() === email);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
      return;
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      res.status(423).json({
        error: "Account temporarily locked after repeated failed login attempts. Try again in 15 minutes.",
        code: "ACCOUNT_LOCKED",
      });
      return;
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      }
      res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
      return;
    }
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    const session = await createAuthSession({
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.cookie(SESSION_COOKIE_NAME, session.rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });
    res.cookie(CSRF_COOKIE_NAME, session.csrfSecret, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });
    await recordAuditEvent({
      organizationId: user.organizationId,
      actorUserId: user.id,
      actor: user.role,
      action: "auth_login_succeeded",
      targetType: "user",
      targetId: user.id,
      summary: `User ${user.email} signed in.`,
      isDemo: true,
    });
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        employeeId: user.employeeId,
      },
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.email, email)))
    .limit(1);

  if (!user || !user.isActive || user.deletedAt) {
    res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    return;
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    res.status(423).json({
      error: "Account temporarily locked after repeated failed login attempts.",
      code: "ACCOUNT_LOCKED",
    });
    return;
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const nextAttempts = user.failedLoginAttempts + 1;
    await db
      .update(usersTable)
      .set({
        failedLoginAttempts: nextAttempts,
        lockedUntil: nextAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(usersTable.id, user.id));
    res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    return;
  }

  await db
    .update(usersTable)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(usersTable.id, user.id));

  const session = await createAuthSession({
    userId: user.id,
    organizationId: user.organizationId,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.cookie(SESSION_COOKIE_NAME, session.rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });
  res.cookie(CSRF_COOKIE_NAME, session.csrfSecret, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: session.expiresAt,
    path: "/",
  });

  await recordAuditEvent({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actor: user.role,
    action: "auth_login_succeeded",
    targetType: "user",
    targetId: user.id,
    summary: `User ${user.email} signed in.`,
    isDemo: user.isDemo,
  });

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId: user.organizationId,
      employeeId: user.employeeId,
    },
  });
});

router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  await revokeAuthSession(token);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
  res.json({ authenticated: false });
});

router.get("/auth/me", async (req: Request, res: Response): Promise<void> => {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  const session = await resolveSessionFromToken(token);
  if (!session) {
    res.status(401).json({ error: "Not authenticated.", code: "UNAUTHENTICATED" });
    return;
  }
  res.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
      organizationId: session.organizationId,
      employeeId: session.employeeId,
      mfaVerified: session.mfaVerified,
    },
  });
});

router.post("/auth/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const orgId =
    typeof req.body?.organizationId === "string" && req.body.organizationId.trim()
      ? req.body.organizationId.trim()
      : process.env.PEOPLEOS_ORGANIZATION_ID || "rekker-demo";
  if (!email) {
    res.status(400).json({ error: "Email is required." });
    return;
  }
  const resetToken = crypto.randomBytes(24).toString("hex");
  const resetTokenHash = hashToken(resetToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  if (!process.env.DATABASE_URL) {
    const users = await ensureDemoAuthUsersSeeded();
    const user = users.find((u) => u.organizationId === orgId && u.email.toLowerCase() === email);
    if (user) {
      user.passwordResetTokenHash = resetTokenHash;
      user.passwordResetExpiresAt = expiresAt;
    }
    res.json({
      accepted: true,
      message: "If an account exists for that email, a password reset link has been issued.",
    });
    return;
  }

  await db
    .update(usersTable)
    .set({ passwordResetTokenHash: resetTokenHash, passwordResetExpiresAt: expiresAt })
    .where(and(eq(usersTable.organizationId, orgId), eq(usersTable.email, email)));

  res.json({
    accepted: true,
    message: "If an account exists for that email, a password reset link has been issued.",
  });
});

router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!token || newPassword.length < 10) {
    res.status(400).json({ error: "Valid reset token and password (min 10 chars) are required." });
    return;
  }
  const tokenHash = hashToken(token);
  const now = new Date();
  const nextHash = await hashPassword(newPassword);

  if (!process.env.DATABASE_URL) {
    const users = await ensureDemoAuthUsersSeeded();
    const user = users.find(
      (u) =>
        u.passwordResetTokenHash === tokenHash &&
        u.passwordResetExpiresAt &&
        u.passwordResetExpiresAt > now,
    );
    if (!user) {
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }
    user.passwordHash = nextHash;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    res.json({ reset: true });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.passwordResetTokenHash, tokenHash))
    .limit(1);
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= now) {
    res.status(400).json({ error: "Invalid or expired reset token." });
    return;
  }
  await db
    .update(usersTable)
    .set({
      passwordHash: nextHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(usersTable.id, user.id));
  res.json({ reset: true });
});

export default router;
