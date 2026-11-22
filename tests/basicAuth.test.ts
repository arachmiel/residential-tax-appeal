import { describe, expect, it } from "vitest";
import { checkBasicAuth } from "@/lib/basicAuth";

const header = (user: string, pass: string) => "Basic " + btoa(`${user}:${pass}`);

describe("checkBasicAuth", () => {
  it("lets everyone in when no password is configured", () => {
    expect(checkBasicAuth(null, undefined)).toBe(true);
    expect(checkBasicAuth(null, "")).toBe(true);
  });
  it("accepts the right password with any user name", () => {
    expect(checkBasicAuth(header("anyone", "s3cret"), "s3cret")).toBe(true);
    expect(checkBasicAuth(header("", "s3cret"), "s3cret")).toBe(true);
  });
  it("rejects a wrong, empty or prefix/superstring password", () => {
    for (const p of ["wrong", "", "s3cre", "s3cret!", "S3CRET"]) expect(checkBasicAuth(header("u", p), "s3cret")).toBe(false);
  });
  it("rejects a missing, non-Basic or malformed header", () => {
    expect(checkBasicAuth(null, "s3cret")).toBe(false);
    expect(checkBasicAuth("Bearer abc", "s3cret")).toBe(false);
    expect(checkBasicAuth("Basic !!!not-base64!!!", "s3cret")).toBe(false);
    expect(checkBasicAuth("Basic " + btoa("nocolon"), "s3cret")).toBe(false);
  });
  it("handles a password that itself contains a colon", () => {
    expect(checkBasicAuth(header("u", "pa:ss"), "pa:ss")).toBe(true);
  });
});
