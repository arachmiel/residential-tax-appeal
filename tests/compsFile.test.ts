import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Comp } from "@/lib/comps";
import { buildCompsWorkbook, compsFileName, MAX_ATTACHED_COMPS } from "@/lib/compsFile";

const comp = (i: number): Comp => ({
  pin: `0608207${String(i).padStart(7, "0")}`, address: `${i} OAK DR`, townshipCode: "18", nbhd: "100", propClass: "203", extWall: "Masonry",
  yearBuilt: 1960 + i, bldgSf: 1500 + i, landSf: 6000, bldgValue: 30000 + i, isMultiCard: false, isMultiLand: false, prorationRate: 1,
  ratio: 20 + i / 100, distance: 0.5, km: 0.2,
});

async function read(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

describe("compsFileName", () => {
  it("matches the county's required name, using the property's dashed PIN", () => {
    expect(compsFileName("06084080080000")).toBe("Comparable PINs for 06-08-408-008-0000.xlsx");
  });
});

describe("buildCompsWorkbook", () => {
  it("writes one row per comp under a PIN-first header, with dashed PINs", async () => {
    const wb = await read(await buildCompsWorkbook([comp(1), comp(2), comp(3)]));
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(1).value).toBe("PIN");
    expect(ws.rowCount).toBe(4);
    expect(ws.getRow(2).getCell(1).value).toBe("06-08-207-000-0001");
    expect(ws.getRow(2).getCell(2).value).toBe("1 OAK DR");
    expect(ws.getRow(2).getCell(10).value).toBe(20.01);
  });

  it("never lists more than six comps, the most the Assessor accepts", async () => {
    const wb = await read(await buildCompsWorkbook(Array.from({ length: 9 }, (_, i) => comp(i + 1))));
    expect(MAX_ATTACHED_COMPS).toBe(6);
    expect(wb.worksheets[0].rowCount).toBe(1 + 6);
  });

  it("is a real .xlsx (zip) file", async () => {
    const bytes = await buildCompsWorkbook([comp(1)]);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
