/**
 * Argentina phone normalization for WhatsApp deep links.
 *
 * The turnero form collects "código de área y número" (10 digits) with a
 * fixed +54 prefix, matching Turnero.dc.html. That's what a person expects
 * to see. But a wa.me link to an Argentine mobile needs the country code
 * *plus* a "9" inserted before the area code+number — e.g. mobile
 * 351 555-1234 must be dialed as wa.me/5493515551234, not wa.me/543515551234.
 * Skipping the 9 is a common bug that silently breaks every WhatsApp link
 * for AR mobiles, so we normalize to that form once and store it.
 */

export interface PhoneNormalizationResult {
  /** True if the input has exactly 10 digits after stripping formatting. */
  valid: boolean;
  /** Digits only, as typed (no country code), e.g. "3511234567". */
  nationalDigits: string;
  /** E.164 with the WhatsApp mobile marker, e.g. "+5493511234567". */
  e164: string;
  /** What to show the user so they can see exactly what was captured. */
  display: string;
}

export function normalizePhoneAr(rawInput: string): PhoneNormalizationResult {
  const nationalDigits = rawInput.replace(/\D/g, "");
  const valid = nationalDigits.length === 10;
  return {
    valid,
    nationalDigits,
    e164: valid ? `+549${nationalDigits}` : "",
    display: valid ? `+54 ${nationalDigits}` : rawInput,
  };
}

/** Strips the leading "+" for use directly in a wa.me/<number> URL. */
export function e164ToWhatsAppDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}
