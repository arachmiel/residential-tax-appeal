import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPin, looksLikePin, normalizePin } from "@/lib/pin";
import { searchAddress } from "@/lib/queries";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  if (looksLikePin(q)) {
    const pin = normalizePin(q);
    if (pin) redirect(`/property/${pin}`);
  }

  const hits = q ? await searchAddress(q) : [];
  const pinProblem = looksLikePin(q) && !normalizePin(q);

  return (
    <>
      <h1>Search</h1>
      <form action="/search" className="search" role="search">
        <input name="q" defaultValue={q} aria-label="Address or PIN" required />
        <button type="submit">Search</button>
      </form>
      {pinProblem && <p>A PIN has 14 digits, like 12-34-567-890-1234. Check the number and try again.</p>}
      {!pinProblem && q && hits.length === 0 && (
        <p>No matching addresses. Try the street number and name without the city, or search by PIN.</p>
      )}
      <ul className="hits">
        {hits.map((h) => (
          <li key={h.pin}>
            <Link href={`/property/${h.pin}`}>
              {h.address}
              <br />
              <small>{[h.city, h.zip].filter(Boolean).join(" ")} · PIN {formatPin(h.pin)}</small>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
