/** Cook County PINs are 14 digits, usually written 12-34-567-890-1234. */
export function normalizePin(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{14}$/.test(digits) ? digits : null;
}

export function formatPin(pin: string): string {
  return pin.length === 14
    ? `${pin.slice(0, 2)}-${pin.slice(2, 4)}-${pin.slice(4, 7)}-${pin.slice(7, 10)}-${pin.slice(10)}`
    : pin;
}

/** True if the text looks like someone is typing a PIN (digits and dashes only, at least 10 digits). */
export function looksLikePin(input: string): boolean {
  return /^[\d\s-]+$/.test(input) && input.replace(/\D/g, "").length >= 10;
}
