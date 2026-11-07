import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : (new Proxy({} as pg.Pool, {
      get(_target, prop) {
        if (!process.env.DATABASE_URL) {
          throw new Error("DATABASE_URL must be set to execute database operations.");
        }
        return (new Pool({ connectionString: process.env.DATABASE_URL }) as any)[prop];
      },
    }));

export const db = process.env.DATABASE_URL
  ? drizzle(pool, { schema })
  : (new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get(_target, prop) {
        if (!process.env.DATABASE_URL) {
          throw new Error("DATABASE_URL must be set to query the database.");
        }
        const activePool = new Pool({ connectionString: process.env.DATABASE_URL });
        return (drizzle(activePool, { schema }) as any)[prop];
      },
    }));

export * from "./schema";
