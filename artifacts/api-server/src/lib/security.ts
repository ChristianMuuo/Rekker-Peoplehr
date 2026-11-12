import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { validateEncryptionKeySetting } from "../config/env";
import { logger } from "./logger";

const DEV_ONLY_EPHEMERAL_FALLBACK = crypto
  .createHash("sha256")
  .update("rekker-peopleos-ephemeral-dev-key-do-not-use-in-prod")
  .digest();

interface KeyRing {
  activeKeyId: string;
  activeKey: Buffer;
  keysById: Map<string, Buffer>;
}

let cachedKeyRing: KeyRing | null = null;

function deriveAes256Key(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function resetSecurityKeyCache(): void {
  cachedKeyRing = null;
}

/**
 * Resolves the active key ring for field-level encryption.
 * Strictly prohibits fallback/derived development keys in production.
 */
export function getEncryptionKeyRing(env: NodeJS.ProcessEnv = process.env): KeyRing {
  if (cachedKeyRing && env === process.env) return cachedKeyRing;

  const isProd = env.NODE_ENV === "production";
  const validation = validateEncryptionKeySetting(env, isProd);
  if (isProd && validation.errors.length > 0) {
    throw new Error(`Invalid production encryption configuration: ${validation.errors.join("; ")}`);
  }

  const activeKeyId = (env.PEOPLEOS_ENCRYPTION_KEY_ID?.trim() || "k1").replace(/[^a-zA-Z0-9_-]/g, "");
  const rawActive = env.PEOPLEOS_ENCRYPTION_KEY?.trim();

  if (!rawActive && isProd) {
    throw new Error("PEOPLEOS_ENCRYPTION_KEY is required in production.");
  }

  const activeKey = rawActive && rawActive.length >= 16
    ? deriveAes256Key(rawActive)
    : DEV_ONLY_EPHEMERAL_FALLBACK;

  const keysById = new Map<string, Buffer>();
  keysById.set(activeKeyId, activeKey);

  // Optional previous rotation keys: "k0=<secret>,legacy=<secret>"
  const prevRaw = env.PEOPLEOS_ENCRYPTION_PREVIOUS_KEYS?.trim();
  if (prevRaw) {
    for (const pair of prevRaw.split(",")) {
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const keyId = pair.slice(0, idx).trim().replace(/[^a-zA-Z0-9_-]/g, "");
      const keyVal = pair.slice(idx + 1).trim();
      if (keyId && keyVal.length >= 16) {
        keysById.set(keyId, deriveAes256Key(keyVal));
      }
    }
  }

  const ring: KeyRing = { activeKeyId, activeKey, keysById };
  if (env === process.env) {
    cachedKeyRing = ring;
  }
  return ring;
}

/**
 * Encrypts sensitive PII (KRA PIN, National ID, NSSF/SHA numbers, bank/M-Pesa targets)
 * using AES-256-GCM. Emits versioned `enc:v2:<keyId>:<iv>:<tag>:<data>` payloads while
 * remaining backward compatible with legacy `enc:v1:<iv>:<tag>:<data>` decryption.
 */
export function encryptSensitiveField(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const trimmed = plaintext.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("enc:v1:") || trimmed.startsWith("enc:v2:")) return trimmed;

  const ring = getEncryptionKeyRing();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ring.activeKey, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v2:${ring.activeKeyId}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/**
 * Decrypts `enc:v2` and legacy `enc:v1` AES-256-GCM protected fields safely.
 * Passes unencrypted legacy plaintext through unchanged; fails safely on tag/key mismatch.
 */
export function decryptSensitiveField(value: string | null | undefined): string | null {
  if (!value) return null;

  if (value.startsWith("enc:v2:")) {
    const parts = value.split(":");
    if (parts.length !== 6) {
      logger.warn({ event: "SECURITY_DECRYPT_FAILURE", version: "v2", reason: "malformed_envelope" }, "Malformed enc:v2 envelope");
      return "[ENCRYPTED_UNAVAILABLE]";
    }
    const keyId = parts[2]!;
    const iv = Buffer.from(parts[3]!, "base64url");
    const tag = Buffer.from(parts[4]!, "base64url");
    const data = Buffer.from(parts[5]!, "base64url");
    try {
      const ring = getEncryptionKeyRing();
      const key = ring.keysById.get(keyId) ?? ring.activeKey;
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      logger.warn({ event: "SECURITY_DECRYPT_FAILURE", version: "v2", keyId }, "Unable to decrypt versioned PII field");
      return "[ENCRYPTED_UNAVAILABLE]";
    }
  }

  if (value.startsWith("enc:v1:")) {
    const parts = value.split(":");
    if (parts.length !== 5) {
      logger.warn({ event: "SECURITY_DECRYPT_FAILURE", version: "v1", reason: "malformed_envelope" }, "Malformed enc:v1 envelope");
      return "[ENCRYPTED_UNAVAILABLE]";
    }
    try {
      const ring = getEncryptionKeyRing();
      const iv = Buffer.from(parts[2]!, "base64url");
      const tag = Buffer.from(parts[3]!, "base64url");
      const data = Buffer.from(parts[4]!, "base64url");
      // Try active key first, then fallback historical keys in ring for smooth rotation
      for (const candidateKey of ring.keysById.values()) {
        try {
          const decipher = crypto.createDecipheriv("aes-256-gcm", candidateKey, iv);
          decipher.setAuthTag(tag);
          return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
        } catch {
          continue;
        }
      }
      throw new Error("No key in key ring decrypted v1 ciphertext");
    } catch {
      logger.warn({ event: "SECURITY_DECRYPT_FAILURE", version: "v1" }, "Unable to decrypt legacy enc:v1 PII field");
      return "[ENCRYPTED_UNAVAILABLE]";
    }
  }

  return value;
}

/**
 * Non-destructive dry-run planner verifying which records can be rotated onto active enc:v2 keyId.
 */
export function inspectKeyRotationReadiness(values: Array<{ recordId: string; field: string; ciphertext: string | null | undefined }>) {
  const ring = getEncryptionKeyRing();
  const summary = {
    activeKeyId: ring.activeKeyId,
    totalScanned: values.length,
    alreadyCurrentV2: 0,
    eligibleLegacyV1: 0,
    eligiblePlaintext: 0,
    unreadable: 0,
  };

  for (const item of values) {
    const val = item.ciphertext;
    if (!val) continue;
    if (val.startsWith(`enc:v2:${ring.activeKeyId}:`)) {
      const dec = decryptSensitiveField(val);
      if (dec === "[ENCRYPTED_UNAVAILABLE]") summary.unreadable += 1;
      else summary.alreadyCurrentV2 += 1;
    } else if (val.startsWith("enc:v1:") || val.startsWith("enc:v2:")) {
      const dec = decryptSensitiveField(val);
      if (dec === "[ENCRYPTED_UNAVAILABLE]") summary.unreadable += 1;
      else summary.eligibleLegacyV1 += 1;
    } else {
      summary.eligiblePlaintext += 1;
    }
  }

  return summary;
}

export function maskKraPin(pin: string | null | undefined): string | null {
  const plain = decryptSensitiveField(pin);
  if (!plain) return null;
  if (plain === "[ENCRYPTED_UNAVAILABLE]") return "[PROTECTED]";
  if (plain.length <= 4) return "****";
  return `${plain.slice(0, 3)}*****${plain.slice(-2)}`;
}

export function maskPhoneNumber(phone: string | null | undefined): string | null {
  const plain = decryptSensitiveField(phone);
  if (!plain) return null;
  if (plain === "[ENCRYPTED_UNAVAILABLE]") return "[PROTECTED]";
  const digits = plain.replace(/\s+/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

export function maskNationalId(id: string | null | undefined): string | null {
  const plain = decryptSensitiveField(id);
  if (!plain) return null;
  if (plain === "[ENCRYPTED_UNAVAILABLE]") return "[PROTECTED]";
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

export const DOCUMENT_MIME_BY_EXT: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".csv": ["text/csv", "application/csv", "text/plain"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export function assertSafeDocumentExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(DOCUMENT_MIME_BY_EXT).some((ext) => lower.endsWith(ext));
}

export function assertSafeDocumentUpload(input: {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  base64Sample?: string;
}): { ok: true; safeName: string } | { ok: false; error: string } {
  const safeName = sanitizeFileName(input.fileName);
  const lower = safeName.toLowerCase();
  const ext = Object.keys(DOCUMENT_MIME_BY_EXT).find((e) => lower.endsWith(e));
  if (!ext) {
    return {
      ok: false,
      error: "Disallowed document extension. Allowed formats: .pdf, .png, .jpg, .jpeg, .csv, .docx, .xlsx",
    };
  }

  if (typeof input.sizeBytes === "number") {
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 10 * 1024 * 1024) {
      return { ok: false, error: "File size must be between 1 byte and 10 MB." };
    }
  }

  if (input.mimeType) {
    const cleanMime = input.mimeType.split(";")[0]!.trim().toLowerCase();
    const allowedMimes = DOCUMENT_MIME_BY_EXT[ext] ?? [];
    if (!allowedMimes.includes(cleanMime)) {
      return {
        ok: false,
        error: `MIME type "${cleanMime}" does not match extension "${ext}".`,
      };
    }
  }

  if (input.base64Sample) {
    const buf = Buffer.from(input.base64Sample, "base64");
    if (ext === ".pdf" && buf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return { ok: false, error: "Invalid PDF signature header." };
    }
    if (ext === ".png" && !buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
      return { ok: false, error: "Invalid PNG signature header." };
    }
    if ((ext === ".jpg" || ext === ".jpeg") && !buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      return { ok: false, error: "Invalid JPEG signature header." };
    }
    if ((ext === ".docx" || ext === ".xlsx") && buf.subarray(0, 2).toString("ascii") !== "PK") {
      return { ok: false, error: "Invalid Office OpenXML ZIP container signature." };
    }
  }

  return { ok: true, safeName };
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
 * Fixed-window per-client rate limiter relying on Express req.ip (respecting configured trust proxy)
 * and authenticated user ID to prevent brute-force, scraping, and AI cost abuse.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  const buckets = new Map<string, RateBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [k, b] of buckets.entries()) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }

    const userId = (req as { auth?: { userId?: string | null } }).auth?.userId || "anon";
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
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
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Rate limit exceeded. Please retry shortly.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    next();
  };
}
