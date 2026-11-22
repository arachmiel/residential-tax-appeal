/**
 * Compare comp-selection policies on a random sample of real homes in one township.
 *   npm run compare -- --township=22 [--sample=80]
 * Requires the township to be loaded (npm run load -- --township=<code>).
 * The sample is pseudo-random across the WHOLE township (ordering by PIN would test only one geographic cluster).
 */
import { DEFAULT_OPTIONS, dissimilarity } from "../src/lib/comps";
import { db } from "../src/lib/db";
import { getComps } from "../src/lib/queries";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const township = arg("township");
const sample = Number(arg("sample") ?? 80);
if (!township) throw new Error("Pass --township=<code>, e.g. --township=22");

const ZERO = { proximity: 0, size: 0, age: 0, land: 0, basement: 0, garage: 0 };
const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

async function main() {
  const { rows } = await db().query(
    `select pin from assessed_values
      where year = (select max(year) from assessed_values) and township_code = $1
        and class in ('202','203','204','205','206') and mailed_bldg > 0
      order by md5(pin) limit $2`,
    [township, sample],
  );
  const pins = rows.map((r) => r.pin as string);
  const policies: Record<string, object> = {
    "lowest ratio wins (old policy)": { weights: ZERO },
    "most similar wins (current)": {},
  };
  for (const [name, opt] of Object.entries(policies)) {
    let full = 0, partial = 0, none = 0;
    const km: number[] = [], gap: number[] = [], dist: number[] = [];
    for (const pin of pins) {
      const c = await getComps(pin, "mailed", opt);
      if (!c) continue;
      if (c.result.meetsTarget) full++; else if (c.result.comps.length) partial++; else none++;
      for (const k of c.result.comps) {
        if (k.km != null) km.push(k.km);
        dist.push(dissimilarity(c.subject, k, DEFAULT_OPTIONS).distance); // same yardstick for both policies
        gap.push(c.result.subjectRatio - k.ratio);
      }
    }
    console.log(`${name}\n  coverage: full ${full}, partial ${partial}, none ${none} (of ${pins.length})`);
    console.log(`  median miles to comps ${(med(km) * 0.621371).toFixed(2)} | similarity distance ${med(dist).toFixed(2)} | $/sf below subject ${med(gap).toFixed(2)}`);
  }
  await db().end();
}

main().catch((e) => { console.error(e); process.exit(1); });
