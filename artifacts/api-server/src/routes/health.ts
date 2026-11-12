import fs from "node:fs";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkDbHealth } from "@workspace/db";
import { getSafeEnvironmentSummary, validateRuntimeEnvironment } from "../config/env";
import { MODULE_PERMISSION_MATRIX } from "../lib/authorization";
import { DEMO_AUDIT_STORE } from "../lib/auditService";
import { isMpesaLiveConfigured } from "../lib/mpesaService";
import { requireRoles } from "../middlewares/peopleosAccess";

const router: IRouter = Router();
const STARTED_AT = new Date().toISOString();

async function checkMlServiceReadiness(): Promise<{
  mode: "external_http" | "local_cli" | "unavailable";
  reachable: boolean;
  detail: string;
}> {
  const serviceUrl = process.env.PEOPLEOS_ML_URL || process.env.ML_SERVICE_URL;
  if (serviceUrl) {
    try {
      const resp = await fetch(`${serviceUrl.replace(/\/$/, "")}/healthz`, {
        signal: AbortSignal.timeout(2000),
      });
      return {
        mode: "external_http",
        reachable: resp.ok,
        detail: resp.ok ? `HTTP ML service responded ${resp.status}` : `HTTP ML service status ${resp.status}`,
      };
    } catch {
      return {
        mode: "external_http",
        reachable: false,
        detail: "Configured ML service URL is unreachable.",
      };
    }
  }

  const cliCandidates = [
    path.join(process.cwd(), "services", "ml-engine", "cli.py"),
    path.join(process.cwd(), "..", "services", "ml-engine", "cli.py"),
    path.join(process.cwd(), "..", "..", "services", "ml-engine", "cli.py"),
  ];
  const cliFound = cliCandidates.some((p) => fs.existsSync(p));
  return {
    mode: cliFound ? "local_cli" : "unavailable",
    reachable: cliFound,
    detail: cliFound
      ? "Local Python ML CLI entrypoint available."
      : "Python ML CLI directory not detected.",
  };
}

// GET /api/healthz — Lightweight process liveness probe (zero secrets)
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// GET /api/readyz — Dependency & configuration readiness probe (fails closed on critical failure)
router.get("/readyz", async (_req: Request, res: Response) => {
  const runtime = validateRuntimeEnvironment(process.env, { throwOnFatal: false });
  const dbHealth = await checkDbHealth(2000);
  const mlHealth = await checkMlServiceReadiness();

  const dbRequiredOk = !runtime.databaseUrl || dbHealth.connected;
  const ready = runtime.valid && dbRequiredOk;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "degraded",
    authMode: runtime.authMode,
    environment: runtime.nodeEnv,
    critical: {
      configuration: runtime.valid ? "operational" : "invalid",
      database: !runtime.databaseUrl
        ? "sandbox_in_memory"
        : dbHealth.connected
          ? "connected"
          : "unavailable",
      encryption:
        runtime.encryptionKey || !runtime.isProduction ? "operational" : "missing_key",
    },
    optionalDependencies: {
      mlService: mlHealth.reachable ? "operational" : "unavailable",
      openAiLlm: runtime.openaiApiKey ? "configured" : "awaiting_credentials",
      mpesaDaraja: isMpesaLiveConfigured() ? "configured" : "awaiting_credentials",
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /api/admin/diagnostics — Restricted Administrator System Diagnostics & Integration Registry
router.get("/admin/diagnostics", async (req: Request, res: Response) => {
  const membership = await requireRoles(
    req,
    res,
    MODULE_PERMISSION_MATRIX.adminDiagnostics.readRoles,
  );
  if (!membership) return;

  const runtime = validateRuntimeEnvironment(process.env, { throwOnFatal: false });
  const envSummary = getSafeEnvironmentSummary(runtime);
  const [dbHealth, mlHealth] = await Promise.all([
    checkDbHealth(2000),
    checkMlServiceReadiness(),
  ]);

  res.json({
    checkedAt: new Date().toISOString(),
    startedAt: STARTED_AT,
    correlationId: req.correlationId,
    application: {
      name: "Rekker PeopleOS",
      version: process.env.npm_package_version || "0.1.0",
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      environment: envSummary.nodeEnv,
      isProduction: envSummary.isProduction,
    },
    subsystems: [
      {
        id: "api_server",
        name: "Express 5 Core API & Correlation Layer",
        status: "Operational",
        healthy: true,
        detail: "Security headers, correlation IDs, and rate limiting active.",
      },
      {
        id: "postgresql_db",
        name: "PostgreSQL & Drizzle ORM",
        status: !dbHealth.configured
          ? "Demo Mode (In-Memory)"
          : dbHealth.connected
            ? "Connected"
            : "Unavailable",
        healthy: !dbHealth.configured || dbHealth.connected,
        latencyMs: dbHealth.latencyMs ?? null,
        detail: !dbHealth.configured
          ? "DATABASE_URL not set; running non-production sandbox fixtures."
          : dbHealth.connected
            ? `SELECT 1 succeeded in ${dbHealth.latencyMs}ms.`
            : "Database connection probe failed.",
      },
      {
        id: "authentication",
        name: "Identity & Access Control",
        status:
          envSummary.authMode === "clerk"
            ? envSummary.clerkConfigured
              ? "Connected (Clerk)"
              : "Degraded (Missing Clerk Keys)"
            : "Demo Mode (Non-Production)",
        healthy: envSummary.authMode === "demo" ? !envSummary.isProduction : envSummary.clerkConfigured,
        detail: `Active authMode=${envSummary.authMode}; ${runtime.errors.length} config error(s).`,
      },
      {
        id: "encryption",
        name: "AES-256-GCM PII Key Ring",
        status: envSummary.encryptionConfigured
          ? "Operational"
          : envSummary.isProduction
            ? "Not Configured (Fatal)"
            : "Dev Key Ring",
        healthy: envSummary.encryptionConfigured || !envSummary.isProduction,
        detail: `Active keyId=${envSummary.encryptionKeyId}; supports enc:v2 & legacy enc:v1.`,
      },
      {
        id: "audit_sink",
        name: "Compliance Audit Trail Sink",
        status: dbHealth.configured
          ? dbHealth.connected
            ? "Operational (Fail-Closed Critical)"
            : "Degraded"
          : "Demo Sandbox Store",
        healthy: !dbHealth.configured || dbHealth.connected,
        detail: `Recent buffered sandbox audit events: ${DEMO_AUDIT_STORE.length}.`,
      },
      {
        id: "python_ml",
        name: "Python Scikit-Learn & XGBoost Engine",
        status: mlHealth.reachable ? "Operational" : "Unavailable",
        healthy: mlHealth.reachable,
        detail: `${mlHealth.mode}: ${mlHealth.detail}`,
      },
    ],
    integrations: [
      {
        id: "clerk",
        provider: "Clerk Auth",
        purpose: "Enterprise SSO, MFA & session verification",
        owningModule: "Authentication",
        environment: envSummary.nodeEnv,
        credentialConfigured: envSummary.clerkConfigured,
        connectivityState: envSummary.clerkConfigured ? "Connected" : "Awaiting Credentials",
        setupNote: "Provision CLERK_SECRET_KEY & VITE_CLERK_PUBLISHABLE_KEY and set PEOPLEOS_AUTH_MODE=clerk.",
      },
      {
        id: "openai",
        provider: "OpenAI API",
        purpose: "Generative multi-agent synthesis in Agent Hub",
        owningModule: "AI Intelligence",
        environment: envSummary.nodeEnv,
        credentialConfigured: envSummary.openAiConfigured,
        connectivityState: envSummary.openAiConfigured ? "Operational" : "Awaiting Credentials (Deterministic Fallback)",
        setupNote: "Provide OPENAI_API_KEY in server environment secrets.",
      },
      {
        id: "mpesa_daraja",
        provider: "Safaricom Daraja B2C",
        purpose: "Approved Kenya payroll salary disbursement",
        owningModule: "Payroll",
        environment: process.env.MPESA_ENV === "production" ? "production" : "sandbox",
        credentialConfigured: isMpesaLiveConfigured(),
        connectivityState: isMpesaLiveConfigured() ? "Configured (Callbacks Required)" : "Awaiting Credentials",
        setupNote: "Provision MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_SECURITY_CREDENTIAL, MPESA_INITIATOR_NAME, and PeopleOS callback URLs.",
      },
      {
        id: "rekker_external_web",
        provider: "rekker.co.ke & shop.rekker.co.ke",
        purpose: "Launched corporate website and consumer storefront (authoritative externally)",
        owningModule: "External Boundary",
        environment: "production",
        credentialConfigured: false,
        connectivityState: "Linked Externally (Not Duplicated)",
        setupNote: "Maintained outside PeopleOS; internal catalog/checkout intentionally omitted.",
      },
    ],
    configWarnings: runtime.warnings,
    configErrors: runtime.errors,
  });
});

export default router;
