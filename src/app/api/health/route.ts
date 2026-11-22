import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment self-test: can this server reach the database, and is there data? Covered by the password gate when
 * SITE_PASSWORD is set. On failure it returns only the network/error CODE (e.g. ETIMEDOUT, ENOTFOUND, ECONNREFUSED),
 * which is what you need to tell "host blocks outbound database connections" from "wrong address" - never the host or password.
 */
export async function GET() {
  const started = Date.now();
  try {
    const { rows } = await db().query(`
      select (select count(*) from assessed_values) as assessed_values,
             (select count(*) from parcel_addresses) as parcel_addresses,
             (select count(*) from appeal_calendar) as appeal_calendar,
             (select count(*) from bor_schedule) as bor_schedule`);
    return Response.json({
      ok: true,
      database: "reachable",
      ms: Date.now() - started,
      node: process.versions.node,
      rows: Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)])),
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const notMigrated = err.code === "42P01"; // undefined_table: connected, but the schema/data isn't there yet
    return Response.json(
      {
        ok: false,
        database: notMigrated ? "reachable, but tables are missing (run the Load data workflow)" : "unreachable",
        code: err.code ?? (err.message?.includes("DATABASE_URL") ? "DATABASE_URL_NOT_SET" : "UNKNOWN"),
        ms: Date.now() - started,
        node: process.versions.node,
      },
      { status: 503 },
    );
  }
}
