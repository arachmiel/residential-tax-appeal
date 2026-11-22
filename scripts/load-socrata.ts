/**
 * Bulk-load Cook County open data into Postgres.
 *
 *   npm run load                                   # everything, default year ranges
 *   npm run load -- --only=assessed_values --from-year=2022 --township=70
 *
 * Loads are idempotent: for each dataset the rows in the requested range are deleted and re-inserted in one transaction.
 * Data is public; COOK_COUNTY_API_APP_TOKEN is optional but avoids Socrata throttling.
 */
import { Pool, type PoolClient } from "pg";

const BASE = "https://datacatalog.cookcountyil.gov/resource";
const PAGE = 50_000;
const RESIDENTIAL = ["202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "234", "278", "295"];
const inList = `(${RESIDENTIAL.map((c) => `'${c}'`).join(",")})`;

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const only = arg("only");
const township = arg("township"); // optional: limit to one township code, handy for dev
const fromYear = Number(arg("from-year") ?? 0) || null;
const thisYear = new Date().getFullYear();

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const i = (v: unknown) => {
  const x = n(v);
  return x === null ? null : Math.round(x);
};
const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

type Row = Record<string, unknown>;
interface Dataset {
  name: string;
  id: string;
  table: string;
  yearField: string;
  defaultFrom: number;
  where: (from: number) => string;
  /** Postgres columns, in the same order `map` returns them. */
  columns: Record<string, "text" | "int" | "numeric" | "boolean">;
  map: (r: Row) => Row;
  conflict?: string; // primary key columns; omit for tables without a natural key
}

const townshipClause = (field: string) => (township ? ` AND ${field}='${township.replace(/'/g, "")}'` : "");

const DATASETS: Dataset[] = [
  {
    name: "assessed_values", id: "uzyt-m557", table: "assessed_values", yearField: "year", defaultFrom: thisYear - 6,
    where: (y) => `year>=${y} AND class in ${inList}${townshipClause("township_code")}`,
    columns: { pin: "text", year: "int", class: "text", township_code: "text", township_name: "text", nbhd: "text",
      mailed_bldg: "numeric", mailed_land: "numeric", mailed_tot: "numeric",
      certified_bldg: "numeric", certified_land: "numeric", certified_tot: "numeric",
      board_bldg: "numeric", board_land: "numeric", board_tot: "numeric" },
    map: (r) => ({ pin: s(r.pin), year: i(r.year), class: s(r.class), township_code: s(r.township_code), township_name: s(r.township_name), nbhd: s(r.nbhd),
      mailed_bldg: n(r.mailed_bldg), mailed_land: n(r.mailed_land), mailed_tot: n(r.mailed_tot),
      certified_bldg: n(r.certified_bldg), certified_land: n(r.certified_land), certified_tot: n(r.certified_tot),
      board_bldg: n(r.board_bldg), board_land: n(r.board_land), board_tot: n(r.board_tot) }),
    conflict: "pin, year",
  },
  {
    name: "parcel_addresses", id: "3723-97qp", table: "parcel_addresses", yearField: "year", defaultFrom: thisYear - 1,
    where: (y) => `year>=${y}`, // property address columns only; owner and mailing address columns are never selected
    columns: { pin: "text", year: "int", address: "text", city: "text", state: "text", zip: "text" },
    map: (r) => ({ pin: s(r.pin), year: i(r.year), address: s(r.prop_address_full), city: s(r.prop_address_city_name), state: s(r.prop_address_state), zip: s(r.prop_address_zipcode_1) }),
    conflict: "pin, year",
  },
  {
    name: "characteristics", id: "x54s-btds", table: "characteristics", yearField: "year", defaultFrom: thisYear - 1,
    where: (y) => `year>=${y} AND class in ${inList}${townshipClause("township_code")}`,
    columns: { pin: "text", year: "int", card: "int", class: "text", township_code: "text", pin_is_multicard: "boolean", pin_is_multiland: "boolean",
      tieback_proration_rate: "numeric", card_proration_rate: "numeric", year_built: "int", bldg_sf: "int", land_sf: "int",
      ext_wall: "text", type_resd: "text", use: "text", apts: "text" },
    map: (r) => ({ pin: s(r.pin), year: i(r.year), card: i(r.card) ?? 1, class: s(r.class), township_code: s(r.township_code),
      pin_is_multicard: r.pin_is_multicard === true || r.pin_is_multicard === "true", pin_is_multiland: r.pin_is_multiland === true || r.pin_is_multiland === "true",
      tieback_proration_rate: n(r.tieback_proration_rate), card_proration_rate: n(r.card_proration_rate),
      year_built: i(r.char_yrblt), bldg_sf: i(r.char_bldg_sf), land_sf: i(r.char_land_sf),
      ext_wall: s(r.char_ext_wall), type_resd: s(r.char_type_resd), use: s(r.char_use), apts: s(r.char_apts) }),
    conflict: "pin, year, card",
  },
  {
    name: "bor_appeals", id: "7pny-nedm", table: "bor_appeals", yearField: "tax_year", defaultFrom: thisYear - 6,
    where: (y) => `tax_year>=${y} AND majorclass='Residential'${townshipClause("township_code")}`,
    columns: { pin: "text", tax_year: "int", township_code: "text", appeal_seq: "int", appeal_type: "text", appeal_type_description: "text",
      assessor_total_value: "numeric", bor_total_value: "numeric", result: "text", change_reason: "text", no_change_reason: "text" },
    map: (r) => ({ pin: s(r.pin), tax_year: i(r.tax_year), township_code: s(r.township_code), appeal_seq: i(r.appealseq),
      appeal_type: s(r.appealtype), appeal_type_description: s(r.appealtypedescription),
      assessor_total_value: n(r.assessor_totalvalue), bor_total_value: n(r.bor_totalvalue), result: s(r.result),
      change_reason: s(r.changereason), no_change_reason: s(r.nochangereasondescription) }),
  },
];

const SOCRATA_FIELDS: Record<string, string[] | undefined> = {
  // Never request personal data we don't use (appellant names, owner/mailing addresses).
  "3723-97qp": ["pin", "year", "prop_address_full", "prop_address_city_name", "prop_address_state", "prop_address_zipcode_1"],
  "7pny-nedm": ["pin", "township_code", "tax_year", "appealseq", "appealtype", "appealtypedescription", "assessor_totalvalue",
    "bor_totalvalue", "result", "changereason", "nochangereasondescription", "majorclass"],
};

async function* fetchPages(d: Dataset, where: string): AsyncGenerator<Row[]> {
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({ $where: where, $order: ":id", $limit: String(PAGE), $offset: String(offset) });
    const select = SOCRATA_FIELDS[d.id];
    if (select) q.set("$select", select.join(","));
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.COOK_COUNTY_API_APP_TOKEN) headers["X-App-Token"] = process.env.COOK_COUNTY_API_APP_TOKEN;

    let rows: Row[] | undefined;
    for (let attempt = 1; attempt <= 5 && !rows; attempt++) {
      const res = await fetch(`${BASE}/${d.id}.json?${q}`, { headers });
      if (res.ok) rows = (await res.json()) as Row[];
      else if (attempt === 5 || ![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`${d.id}: HTTP ${res.status} ${await res.text()}`);
      else await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
    if (!rows || rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE) return;
  }
}

/** Where-clauses to load for a dataset. The address dataset has no township column, so a township-limited run asks for just the loaded PINs. */
async function* whereClauses(client: PoolClient, d: Dataset, from: number): AsyncGenerator<string> {
  if (township && d.name === "parcel_addresses") {
    const { rows } = await client.query("select distinct pin from assessed_values where township_code = $1", [township]);
    const pins = rows.map((r) => r.pin as string);
    for (let k = 0; k < pins.length; k += 400) {
      yield `year>=${from} AND pin in (${pins.slice(k, k + 400).map((p) => `'${p}'`).join(",")})`;
    }
    return;
  }
  yield d.where(from);
}

async function insertBatch(client: PoolClient, d: Dataset, rows: Row[]) {
  const cols = Object.keys(d.columns);
  const types = cols.map((c) => `${c} ${d.columns[c] === "int" ? "integer" : d.columns[c]}`).join(", ");
  const updates = cols.filter((c) => !(d.conflict ?? "").split(", ").includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
  const onConflict = d.conflict ? `on conflict (${d.conflict}) do update set ${updates}` : "";
  // json_to_recordset keeps this to one round-trip per batch; filter out rows missing their key.
  const mapped = rows.map(d.map).filter((r) => r.pin);
  for (let k = 0; k < mapped.length; k += 10_000) {
    await client.query(
      `insert into ${d.table} (${cols.join(", ")}) select ${cols.join(", ")} from json_to_recordset($1::json) as t(${types}) ${onConflict}`,
      [JSON.stringify(mapped.slice(k, k + 10_000))],
    );
  }
  return mapped.length;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const d of DATASETS.filter((x) => !only || x.name === only)) {
      const from = fromYear ?? d.defaultFrom;
      const started = Date.now();
      console.log(`[${d.name}] loading ${d.where(from)}`);
      const client = await pool.connect();
      try {
        await client.query("begin");
        const code = township?.replace(/'/g, "");
        const scope = !code ? "" : d.name === "parcel_addresses"
          ? ` and pin in (select pin from assessed_values where township_code = '${code}')`
          : ` and township_code = '${code}'`;
        await client.query(`delete from ${d.table} where ${d.yearField} >= $1${scope}`, [from]);
        let total = 0;
        for await (const where of whereClauses(client, d, from)) {
          for await (const page of fetchPages(d, where)) {
            total += await insertBatch(client, d, page);
            process.stdout.write(`\r[${d.name}] ${total.toLocaleString()} rows`);
          }
        }
        await client.query("insert into load_log (dataset, row_count) values ($1, $2) on conflict (dataset) do update set loaded_at = now(), row_count = $2", [d.name, total]);
        await client.query("commit");
        console.log(`\n[${d.name}] done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
