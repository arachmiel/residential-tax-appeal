import { describe, expect, it } from "vitest";
import { formatPin, looksLikePin, normalizePin } from "@/lib/pin";

describe("pin", () => {
  it("normalizes dashed, spaced and plain PINs", () => {
    expect(normalizePin("12-34-567-890-1234")).toBe("12345678901234");
    expect(normalizePin(" 12345678901234 ")).toBe("12345678901234");
  });
  it("rejects wrong lengths and letters", () => {
    expect(normalizePin("1234567890")).toBeNull();
    expect(normalizePin("1234567890123A")).toBeNull();
  });
  it("formats PINs", () => expect(formatPin("12345678901234")).toBe("12-34-567-890-1234"));
  it("tells PINs from addresses", () => {
    expect(looksLikePin("12-34-567-890")).toBe(true);
    expect(looksLikePin("123 N Main St")).toBe(false);
    expect(looksLikePin("123")).toBe(false);
  });
});
