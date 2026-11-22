import { appealStage } from "@/lib/calendar";
import { buildCompsWorkbook, compsFileName } from "@/lib/compsFile";
import { isAboveMedian } from "@/lib/filing";
import { todayIso } from "@/lib/format";
import { normalizePin } from "@/lib/pin";
import { getCalendarForTownship, getComps, getProperty, toCalendarEntry } from "@/lib/queries";

export const dynamic = "force-dynamic";

const notFound = (why: string) => new Response(why, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * Excel list of the comparable PINs, named the way the Assessor requires, for attaching to an Assessor appeal.
 * Only offered while the Assessor window is open and the property is above the median of similar properties, the same
 * conditions under which the checklist suggests comps at all.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ pin: string }> }) {
  const pin = normalizePin((await ctx.params).pin);
  if (!pin) return notFound("Invalid PIN.");

  const property = await getProperty(pin);
  if (!property) return notFound("Property not found.");

  const row = property.townshipName ? await getCalendarForTownship(property.townshipName) : null;
  if (!row || appealStage(toCalendarEntry(row), todayIso()) !== "assessor_open") {
    return notFound("The Assessor's appeal window is not open for this property.");
  }

  const comps = await getComps(pin, "mailed").catch(() => null);
  if (!comps || isAboveMedian(comps.result) !== true || comps.result.comps.length === 0) {
    return notFound("We are not suggesting comparable properties for this PIN.");
  }

  const bytes = await buildCompsWorkbook(comps.result.comps);
  const name = compsFileName(pin);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
