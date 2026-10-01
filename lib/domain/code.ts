import { businessConfig } from "@/lib/config/business";

// 32 chars, no 0/O/1/I (visually ambiguous). 256 % 32 === 0, so mapping a
// random byte via `byte % alphabet.length` is uniform — no modulo bias.
const ALPHABET = businessConfig.rules.codeAlphabet;

function randomByte(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint8Array(1))[0]!;
  }
  // Fallback for test environments without Web Crypto.
  return Math.floor(Math.random() * 256);
}

/**
 * Generates a non-sequential, non-guessable appointment code like "GB-7K4Q".
 * Not a secret on its own (it's shown to the customer to look up status),
 * but must not be enumerable/incremental — see docs/assumptions.md rule
 * "Código: GB- + 4 caracteres sin ambiguos (sin 0/O/1/I)".
 */
export function generateAppointmentCode(): string {
  let suffix = "";
  for (let i = 0; i < businessConfig.rules.codeLength; i++) {
    suffix += ALPHABET[randomByte() % ALPHABET.length];
  }
  return `${businessConfig.rules.codePrefix}${suffix}`;
}

export function isValidAppointmentCodeFormat(code: string): boolean {
  const pattern = new RegExp(
    `^${businessConfig.rules.codePrefix}[${ALPHABET}]{${businessConfig.rules.codeLength}}$`,
  );
  return pattern.test(code.trim().toUpperCase());
}
