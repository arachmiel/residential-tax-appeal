import { db } from "./db";
import { findComps, type CompsOptions, type CompsResult, type Property } from "./comps";

export interface AddressHit {
  pin: string;
  address: string;
  city: string | null;
  zip: string | null;
}

export interface ValueRow {
  year: number;
  class: string | null;
  mailed_bldg: number | null;
  mailed_land: number | null;
  mailed_tot: number | null;
  certified_tot: number | null;
  board_tot: number | null;
}

export interface BorAppeal {
  tax_year: number;
  appeal_type_description: string | null;
  assessor_total_value: number | null;
  bor_total_value: number | null;
  result: string | null;
  change_reason: string | null;
  no_change_reason: string | null;
}

export interface PropertyRecord {
  pin: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  townshipCode: string | null;
  townshipName: string | null;
  nbhd: string | null;
  propClass: string | null;
  extWall: string | null;
  yearBuilt: number | null;
  bldgSf: number | null;
  landSf: number | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function searchAddress(q: string, limit = 15): Promise<AddressHit[]> {
  const term = q.trim().toUpperCase().replace(/\s+/g, " ");
  if (term.length < 3) return [];
  const { rows } = await db().query(
    `select pin, address, city, zip
       from parcel_addresses
      where year = (select max(year) from parcel_addresses)
        and upper(address) like $1
      order by (upper(address) like $2) desc, address
      limit $3`,
    [`%${term.replace(/[%_]/g, "")}%`, `${term.replace(/[%_]/g, "")}%`, limit],
  );
  return rows;
}

export async function getProperty(pin: string): Promise<PropertyRecord | null> {
  const { rows } = await db().query(
    `with v as (select * from assessed_values where pin = $1 order by year desc limit 1),
          a as (select * from parcel_addresses where pin = $1 order by year desc limit 1),
          c as (select * from characteristics where pin = $1 order by year desc, card limit 1)
     select v.pin, a.address, a.city, a.zip, v.township_code, v.township_name, v.nbhd, v.class,
            c.ext_wall, c.year_built, c.bldg_sf, c.land_sf
       from v left join a on true left join c on true`,
    [pin],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    pin: r.pin,
    address: r.address,
    city: r.city,
    zip: r.zip,
    townshipCode: r.township_code,
    townshipName: r.township_name,
    nbhd: r.nbhd,
    propClass: r.class,
    extWall: r.ext_wall,
    yearBuilt: num(r.year_built),
    bldgSf: num(r.bldg_sf),
    landSf: num(r.land_sf),
  };
}

export async function getValueHistory(pin: string): Promise<ValueRow[]> {
  const { rows } = await db().query(
    `select year, class, mailed_bldg, mailed_land, mailed_tot, certified_tot, board_tot
       from assessed_values where pin = $1 order by year desc`,
    [pin],
  );
  return rows.map((r) => ({
    year: r.year, class: r.class,
    mailed_bldg: num(r.mailed_bldg), mailed_land: num(r.mailed_land), mailed_tot: num(r.mailed_tot),
    certified_tot: num(r.certified_tot), board_tot: num(r.board_tot),
  }));
}

export async function getBorAppeals(pin: string): Promise<BorAppeal[]> {
  const { rows } = await db().query(
    `select tax_year, appeal_type_description, assessor_total_value, bor_total_value, result, change_reason, no_change_reason
       from bor_appeals where pin = $1 order by tax_year desc, appeal_seq`,
    [pin],
  );
  return rows.map((r) => ({ ...r, assessor_total_value: num(r.assessor_total_value), bor_total_value: num(r.bor_total_value) }));
}

export interface CalendarRow {
  year: number; region: string; township: string;
  notice_date: string | null; last_file_date: string | null; a_roll_certified: string | null; a_roll_published: string | null;
  bor_start: string | null; bor_end: string | null; pass: number | null; status_text: string | null;
}

export async function getCalendarForTownship(townshipName: string): Promise<CalendarRow | null> {
  const { rows } = await db().query(
    `select year, region, township,
            to_char(notice_date,'YYYY-MM-DD') notice_date, to_char(last_file_date,'YYYY-MM-DD') last_file_date,
            to_char(a_roll_certified,'YYYY-MM-DD') a_roll_certified, to_char(a_roll_published,'YYYY-MM-DD') a_roll_published,
            to_char(bor_start,'YYYY-MM-DD') bor_start, to_char(bor_end,'YYYY-MM-DD') bor_end, pass, status_text
       from appeal_calendar where lower(township) = lower($1) order by year desc limit 1`,
    [townshipName],
  );
  return rows[0] ?? null;
}

/**
 * Comparable properties for a PIN. `basis` picks the value being compared:
 * "mailed" for the Assessor appeal, "certified" for the Board of Review.
 */
export async function getComps(pin: string, basis: "mailed" | "certified", options: Partial<CompsOptions> = {}): Promise<{ result: CompsResult; valueYear: number; subject: Property } | null> {
  const col = basis === "mailed" ? "mailed_bldg" : "certified_bldg";
  const { rows: subj } = await db().query(
    `select max(year) y from assessed_values where pin = $1 and ${col} > 0`, [pin],
  );
  const year: number | null = subj[0]?.y ?? null;
  if (!year) return null;

  const { rows } = await db().query(
    `with s as (select township_code, nbhd, class from assessed_values where pin = $1 and year = $2)
     select av.pin, pa.address, av.township_code, av.nbhd, av.class, c.ext_wall, c.year_built, c.bldg_sf, c.land_sf, c.bsmt, c.bsmt_fin, c.gar1_att, c.gar1_size,
            pc.lat, pc.lon, av.${col} as bldg_value, c.pin_is_multicard, c.pin_is_multiland, c.tieback_proration_rate
       from assessed_values av
       join s on s.township_code = av.township_code and s.nbhd = av.nbhd and s.class = av.class
       join characteristics c on c.pin = av.pin
                              and c.year = (select max(year) from characteristics where pin = av.pin)
                              and c.card = (select min(card) from characteristics x where x.pin = av.pin and x.year = c.year)
       left join lateral (select lat, lon from parcels where pin = av.pin order by year desc limit 1) pc on true
       left join lateral (select address from parcel_addresses where pin = av.pin order by year desc limit 1) pa on true
      where av.year = $2 and av.${col} > 0`,
    [pin, year],
  );

  const toProperty = (r: Record<string, unknown>): Property => ({
    pin: String(r.pin),
    address: (r.address as string) ?? null,
    townshipCode: String(r.township_code),
    nbhd: String(r.nbhd),
    propClass: String(r.class),
    extWall: (r.ext_wall as string) ?? null,
    yearBuilt: num(r.year_built),
    bldgSf: num(r.bldg_sf),
    landSf: num(r.land_sf),
    bldgValue: num(r.bldg_value),
    isMultiCard: Boolean(r.pin_is_multicard),
    isMultiLand: Boolean(r.pin_is_multiland),
    prorationRate: num(r.tieback_proration_rate) ?? 1,
    lat: num(r.lat),
    lon: num(r.lon),
    bsmt: (r.bsmt as string) ?? null,
    bsmtFin: (r.bsmt_fin as string) ?? null,
    garAtt: (r.gar1_att as string) ?? null,
    garSize: (r.gar1_size as string) ?? null,
  });

  const all = rows.map(toProperty);
  const subject = all.find((p) => p.pin === pin);
  if (!subject) return null;
  return { result: findComps(subject, all, options), valueYear: year, subject };
}
