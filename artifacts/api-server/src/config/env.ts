import { URL } from "node:url";

export type PeopleOsAuthMode = "clerk" | "demo";

export interface RuntimeEnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  authMode: PeopleOsAuthMode;
  databaseUrl: string | undefined;
  clerkSecretKey: string | undefined;
  clerkPublishableKey: string | undefined;
  encryptionKey: string | undefined;
  encryptionKeyId: string;
  allowedOrigins: string[];
  trustProxy: boolean | number;
  mlServiceUrl: string | undefined;
  openaiApiKey: string | undefined;
  organizationId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const KNOWN_DEV_KEY_FRAGMENTS = [
  "rekker-peopleos-ephemeral-dev-key",
  "changeme",
  "default-dev-key",
  "placeholder",
  "secret123",
];

export function parseAllowedOrigins(raw: string | undefined, isProduction: boolean): {
  origins: string[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || !raw.trim()) {
    if (isProduction) {
      errors.push(
        "PEOPLEOS_ALLOWED_ORIGINS must be explicitly set to exact origin URLs in production.",
      );
      return { origins: [], errors };
    }
    return {
      origins: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
      ],
      errors,
    };
  }

  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origins: string[] = [];
  for (const part of parts) {
    if (part === "*") {
      errors.push(
        "PEOPLEOS_ALLOWED_ORIGINS cannot contain wildcard '*' when credentialed CORS is active.",
      );
      continue;
    }
    try {
      const parsed = new URL(part);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.push(`Invalid origin scheme in PEOPLEOS_ALLOWED_ORIGINS: "${part}"`);
        continue;
      }
      origins.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      errors.push(`Invalid URL format in PEOPLEOS_ALLOWED_ORIGINS: "${part}"`);
    }
  }

  return { origins, errors };
}

export function resolveAuthMode(env: NodeJS.ProcessEnv): {
  authMode: PeopleOsAuthMode;
  errors: string[];
  warnings: string[];
} {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const rawMode = env.PEOPLEOS_AUTH_MODE?.trim().toLowerCase();
  const demoFlag = env.PEOPLEOS_DEMO_AUTH?.trim().toLowerCase() === "true";
  const hasClerkSecret = Boolean(env.CLERK_SECRET_KEY?.trim());

  const errors: string[] = [];
  const warnings: string[] = [];

  if (rawMode && rawMode !== "clerk" && rawMode !== "demo") {
    errors.push(
      `PEOPLEOS_AUTH_MODE must be 'clerk' or 'demo' (received invalid value).`,
    );
  }

  let authMode: PeopleOsAuthMode;
  if (rawMode === "clerk" || rawMode === "demo") {
    authMode = rawMode;
  } else if (isProduction || hasClerkSecret) {
    authMode = "clerk";
  } else {
    authMode = "demo";
  }

  if (isProduction) {
    if (authMode === "demo" || demoFlag) {
      errors.push(
        "Demo authentication (PEOPLEOS_AUTH_MODE=demo or PEOPLEOS_DEMO_AUTH=true) is strictly prohibited in NODE_ENV=production.",
      );
      authMode = "clerk";
    }
    if (!hasClerkSecret) {
      errors.push("CLERK_SECRET_KEY is required in NODE_ENV=production.");
    }
    if (!env.CLERK_PUBLISHABLE_KEY?.trim() && !env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) {
      errors.push(
        "CLERK_PUBLISHABLE_KEY or VITE_CLERK_PUBLISHABLE_KEY is required in NODE_ENV=production.",
      );
    }
  } else {
    if (authMode === "clerk" && !hasClerkSecret) {
      errors.push("PEOPLEOS_AUTH_MODE=clerk requires CLERK_SECRET_KEY to be set.");
    }
    if (authMode === "demo" && hasClerkSecret) {
      warnings.push(
        "CLERK_SECRET_KEY is set while PEOPLEOS_AUTH_MODE=demo; switching authMode to 'clerk' to prevent dual-auth ambiguity.",
      );
      authMode = "clerk";
    }
  }

  return { authMode, errors, warnings };
}

export function validateEncryptionKeySetting(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const key = env.PEOPLEOS_ENCRYPTION_KEY?.trim();

  if (!key) {
    if (isProduction) {
      errors.push(
        "PEOPLEOS_ENCRYPTION_KEY is required in production (minimum 32 high-entropy characters).",
      );
    } else {
      warnings.push(
        "PEOPLEOS_ENCRYPTION_KEY not set; using non-production development key ring (never deploy without an explicit high-entropy key).",
      );
    }
    return { errors, warnings };
  }

  if (key.length < 32) {
    if (isProduction) {
      errors.push(
        "PEOPLEOS_ENCRYPTION_KEY must be at least 32 characters in production.",
      );
    } else {
      warnings.push("PEOPLEOS_ENCRYPTION_KEY is shorter than recommended 32 characters.");
    }
  }

  const lower = key.toLowerCase();
  if (KNOWN_DEV_KEY_FRAGMENTS.some((frag) => lower.includes(frag))) {
    errors.push(
      "PEOPLEOS_ENCRYPTION_KEY must not match known default/development placeholders.",
    );
  }

  if (
    (env.CLERK_SECRET_KEY && key === env.CLERK_SECRET_KEY) ||
    (env.DATABASE_URL && key === env.DATABASE_URL)
  ) {
    errors.push(
      "PEOPLEOS_ENCRYPTION_KEY must be an independent secret, not reused from CLERK_SECRET_KEY or DATABASE_URL.",
    );
  }

  return { errors, warnings };
}

export function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw || !raw.trim()) return false;
  const val = raw.trim().toLowerCase();
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (Number.isInteger(num) && num >= 0 && num <= 10) return num;
  return false;
}

export function validateRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: { throwOnFatal?: boolean } = {},
): RuntimeEnvConfig {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawPort = env.PORT ?? "5000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`Invalid PORT value (must be 1..65535).`);
  }

  const authCheck = resolveAuthMode(env);
  errors.push(...authCheck.errors);
  warnings.push(...authCheck.warnings);

  const encCheck = validateEncryptionKeySetting(env, isProduction);
  errors.push(...encCheck.errors);
  warnings.push(...encCheck.warnings);

  const corsCheck = parseAllowedOrigins(env.PEOPLEOS_ALLOWED_ORIGINS, isProduction);
  errors.push(...corsCheck.errors);

  if (isProduction && !env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL is required in production.");
  }

  if (env.DATABASE_URL && !/^postgres(ql)?:\/\//i.test(env.DATABASE_URL.trim())) {
    errors.push("DATABASE_URL must be a valid PostgreSQL connection string.");
  }

  const mlUrl = env.PEOPLEOS_ML_URL?.trim() || env.ML_SERVICE_URL?.trim();
  if (mlUrl) {
    try {
      const parsed = new URL(mlUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.push("PEOPLEOS_ML_URL must use http:// or https:// scheme.");
      }
    } catch {
      errors.push("PEOPLEOS_ML_URL must be a valid URL.");
    }
  }

  const config: RuntimeEnvConfig = {
    nodeEnv,
    isProduction,
    port: Number.isInteger(port) && port > 0 ? port : 5000,
    authMode: authCheck.authMode,
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    clerkSecretKey: env.CLERK_SECRET_KEY?.trim() || undefined,
    clerkPublishableKey:
      env.CLERK_PUBLISHABLE_KEY?.trim() || env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || undefined,
    encryptionKey: env.PEOPLEOS_ENCRYPTION_KEY?.trim() || undefined,
    encryptionKeyId: env.PEOPLEOS_ENCRYPTION_KEY_ID?.trim() || "k1",
    allowedOrigins: corsCheck.origins,
    trustProxy: parseTrustProxy(env.PEOPLEOS_TRUST_PROXY),
    mlServiceUrl: mlUrl,
    openaiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    organizationId: env.PEOPLEOS_ORGANIZATION_ID?.trim() || "rekker-demo",
    valid: errors.length === 0,
    errors,
    warnings,
  };

  if (options.throwOnFatal && !config.valid) {
    throw new Error(
      `Invalid PeopleOS runtime configuration (${config.errors.length} error(s)):\n - ${config.errors.join("\n - ")}`,
    );
  }

  return config;
}

export function getSafeEnvironmentSummary(config: RuntimeEnvConfig) {
  return {
    nodeEnv: config.nodeEnv,
    isProduction: config.isProduction,
    authMode: config.authMode,
    databaseConfigured: Boolean(config.databaseUrl),
    clerkConfigured: Boolean(config.clerkSecretKey && config.clerkPublishableKey),
    encryptionConfigured: Boolean(config.encryptionKey),
    encryptionKeyId: config.encryptionKeyId,
    corsStrictAllowlistCount: config.allowedOrigins.length,
    trustProxyConfigured: config.trustProxy !== false,
    mlExternalUrlConfigured: Boolean(config.mlServiceUrl),
    openAiConfigured: Boolean(config.openaiApiKey),
    configValid: config.valid,
    errorCount: config.errors.length,
    warningCount: config.warnings.length,
  };
}
