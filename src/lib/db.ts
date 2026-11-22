import { Pool } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

/** One pool per process (also survives Next.js dev hot reloads). */
export function db(): Pool {
  if (!globalThis.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");
    globalThis.__pgPool = new Pool({ connectionString, max: 10 });
  }
  return globalThis.__pgPool;
}
