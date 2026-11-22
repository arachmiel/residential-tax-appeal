const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : usd0.format(v));
export const perSf = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${usd2.format(v)}/sf`);
export const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US"));

/** "2026-11-23" -> "Nov 23, 2026" (no timezone shifts: parsed as plain date parts). */
export function niceDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
