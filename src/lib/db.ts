import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

/**
 * One pool per process (also survives Next.js dev hot reloads).
 *
 * Settings suit a small hosted plan talking to a managed Postgres: a handful of connections (managed databases and
 * poolers cap them), and a connect timeout so a blocked or unreachable database fails in seconds instead of hanging.
 * Override the pool size with PGPOOL_MAX. TLS comes from the connection string (e.g. ?sslmode=require).
 */
export function db(): Pool {
  if (!globalThis.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");
    globalThis.__pgPool = new Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX) || 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__pgPool;
}
