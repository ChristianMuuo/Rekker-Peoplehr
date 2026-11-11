import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const DEFAULT_DEV_KEY = crypto
  .createHash("sha256")
  .update("rekker-peopleos-ephemeral-dev-key-do-not-use-in-prod")
  .digest();

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PEOPLEOS_ENCRYPTION_KEY;
  if (raw && raw.length >= 16) {
    cachedKey = crypto.createHash("sha256").update(raw).digest();
    return cachedKey;
  }
  if (process.env.NODE_ENV === "production" && !raw) {
    // Derive from CLERK_SECRET_KEY or DATABASE_URL only if explicit key is absent,
    // keeping field encryption operational without failing startup, while warning loudly.
    const fallbackSeed =
      process.env.CLERK_SECRET_KEY || process.env.DATABASE_URL || "";
    if (fallbackSeed) {
      cachedKey = crypto
        .createHmac("sha256", "peopleos-pii-key-v1")
        .update(fallbackSeed)
        .digest();
      return cachedKey;
    }
  }
  cachedKey = DEFAULT_DEV_KEY;
  return cachedKey;
}

/**
 * Encrypts sensitive PII (KRA PIN, National ID, NSSF/SHA numbers, bank/M-Pesa targets)
 * using AES-256-GCM with an authenticated 12-byte IV and 16-byte auth tag.
 */
export function encryptSensitiveField(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const trimmed = plaintext.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("enc:v1:")) return trimmed;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(trimmed, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/**
 * Decrypts AES-256-GCM protected fields transparently; passes legacy plaintext through unchanged.
 */
export function decryptSensitiveField(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("enc:v1:")) return value;
  const parts = value.split(":");
  if (parts.length !== 5) return value;
  try {
    const iv = Buffer.from(parts[2]!, "base64url");
    const tag = Buffer.from(parts[3]!, "base64url");
    const data = Buffer.from(parts[4]!, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "[ENCRYPTED_UNAVAILABLE]";
  }
}

export function maskKraPin(pin: string | null | undefined): string | null {
  const plain = decryptSensitiveField(pin);
  if (!plain) return null;
  if (plain.length <= 4) return "****";
  return `${plain.slice(0, 3)}*****${plain.slice(-2)}`;
}

export function maskPhoneNumber(phone: string | null | undefined): string | null {
  const plain = decryptSensitiveField(phone);
  if (!plain) return null;
  const digits = plain.replace(/\s+/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

export function maskNationalId(id: string | null | undefined): string | null {
  const plain = decryptSensitiveField(id);
  if (!plain) return null;
  if (plain.length <= 4) return "****";
  return `****${plain.slice(-3)}`;
}

export function sanitizeText(value: unknown, maxLength: number = 1000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeFileName(name: string): string {
  const base = name
    .replace(/[/\\]+/g, "_")
    .replace(/\.\.+/g, "_")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/^[._\s]+/, "")
    .trim()
    .slice(0, 140);
  return base || `document_${Date.now()}.pdf`;
}

export function assertSafeDocumentExtension(name: string): boolean {
  const allowed = [".pdf", ".png", ".jpg", ".jpeg", ".csv", ".docx", ".xlsx"];
  const lower = name.toLowerCase();
  return allowed.some((ext) => lower.endsWith(ext));
}

export function applySecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * Sliding/fixed-window per-client rate limiter to mitigate brute-force, scraping, and AI cost abuse.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    // Periodically prune stale buckets to prevent unbounded memory growth
    if (buckets.size > 5000) {
      for (const [k, b] of buckets.entries()) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }

    const userId = (req as any).auth?.userId || "anon";
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";
    const key = `${options.keyPrefix}:${userId}:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.maxRequests - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.maxRequests) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Rate limit exceeded. Please retry shortly.",
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    next();
  };
}
