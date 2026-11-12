import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensurePool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set to execute database operations.");
  }
  if (!_pool) {
    _pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

export const pool: pg.Pool = process.env.DATABASE_URL
  ? ensurePool()
  : (new Proxy({} as pg.Pool, {
      get(_target, prop) {
        const instance = ensurePool();
        const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === "function" ? value.bind(instance) : value;
      },
    }));

export const db: ReturnType<typeof drizzle<typeof schema>> = process.env.DATABASE_URL
  ? (_db ??= drizzle(ensurePool(), { schema }))
  : (new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get(_target, prop) {
        if (!_db) {
          _db = drizzle(ensurePool(), { schema });
        }
        const value = (_db as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === "function" ? value.bind(_db) : value;
      },
    }));

export async function closeDbPool(): Promise<void> {
  if (_pool) {
    const active = _pool;
    _pool = null;
    _db = null;
    await active.end();
  }
}

export async function checkDbHealth(timeoutMs: number = 2000): Promise<{
  configured: boolean;
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  if (!process.env.DATABASE_URL) {
    return { configured: false, connected: false };
  }
  const started = Date.now();
  try {
    const activePool = ensurePool();
    await Promise.race([
      activePool.query("SELECT 1"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Database health check timed out")), timeoutMs),
      ),
    ]);
    return { configured: true, connected: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "Database unreachable",
    };
  }
}

export * from "./schema";
