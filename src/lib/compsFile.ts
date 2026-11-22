import ExcelJS from "exceljs";
import type { Comp } from "./comps";
import { formatPin } from "./pin";

/** The Assessor accepts at most six comparable PINs with an online appeal. */
export const MAX_ATTACHED_COMPS = 6;

/**
 * File name the Assessor requires for an Excel list of comparable PINs:
 *   "Comparable PINs for xx-xx-xxx-xxx-xxxx.xlsx"
 * where the PIN is the property being appealed (per https://www.cookcountyassessoril.gov/find-comparable-properties;
 * the county's older Cook Viewer guide words this ambiguously, so confirm if the portal rejects it).
 */
export function compsFileName(subjectPin: string): string {
  return `Comparable PINs for ${formatPin(subjectPin)}.xlsx`;
}

/**
 * An Excel list of up to six comparable PINs, to attach in the "Comparable PINs Data" section of the Assessor's online
 * appeal. The county does not publish a column layout; the PIN is first and in the county's dashed format, and the
 * other columns are the facts an analyst would check.
 */
export async function buildCompsWorkbook(comps: Comp[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Comparable PINs");
  ws.columns = [
    { header: "PIN", key: "pin", width: 20 },
    { header: "Address", key: "address", width: 30 },
    { header: "Class", key: "propClass", width: 8 },
    { header: "Neighborhood", key: "nbhd", width: 14 },
    { header: "Year built", key: "yearBuilt", width: 11 },
    { header: "Building sq ft", key: "bldgSf", width: 15 },
    { header: "Land sq ft", key: "landSf", width: 12 },
    { header: "Exterior", key: "extWall", width: 12 },
    { header: "Building assessed value", key: "bldgValue", width: 24 },
    { header: "Building value per sq ft", key: "ratio", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of comps.slice(0, MAX_ATTACHED_COMPS)) {
    ws.addRow({
      pin: formatPin(c.pin),
      address: c.address ?? "",
      propClass: c.propClass,
      nbhd: c.nbhd,
      yearBuilt: c.yearBuilt ?? "",
      bldgSf: c.bldgSf ?? "",
      landSf: c.landSf ?? "",
      extWall: c.extWall ?? "",
      bldgValue: c.bldgValue ?? "",
      ratio: Number(c.ratio.toFixed(2)),
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
