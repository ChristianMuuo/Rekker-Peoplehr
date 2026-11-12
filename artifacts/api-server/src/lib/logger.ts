import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-peopleos-role']",
      "req.headers['x-peopleos-user-id']",
      "req.headers['x-api-key']",
      "res.headers['set-cookie']",
      "*.password",
      "*.secret",
      "*.token",
      "*.accessToken",
      "*.securityCredential",
      "*.kraPin",
      "*.nationalId",
      "*.nssfNo",
      "*.shaNo",
      "*.bankAccount",
      "*.confidentialNotes",
      "*.phone",
      "*.DATABASE_URL",
      "*.PEOPLEOS_ENCRYPTION_KEY",
      "*.CLERK_SECRET_KEY",
      "*.OPENAI_API_KEY",
      "*.MPESA_CONSUMER_SECRET",
      "*.MPESA_SECURITY_CREDENTIAL",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
