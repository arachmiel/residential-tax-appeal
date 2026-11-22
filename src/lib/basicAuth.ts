/** Constant-time string comparison (no early exit), so response timing doesn't leak how much of a password matched. */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Checks an HTTP Basic `Authorization` header against a shared password. Any user name is accepted; only the password
 * matters. Returns true when no password is configured (the gate is off, e.g. local development).
 */
export function checkBasicAuth(header: string | null, password: string | undefined): boolean {
  if (!password) return true;
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return safeEqual(decoded.slice(i + 1), password);
}
