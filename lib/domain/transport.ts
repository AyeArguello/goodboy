import { businessConfig } from "@/lib/config/business";
import {
  FAR_BARRIOS,
  FREE_BARRIOS,
  NEARBY_BARRIOS,
} from "@/lib/config/barriosCordoba";

export type TransportTier = "free" | "nearby" | "far";

export interface TransportQuote {
  tier: TransportTier;
  /** Amount in words, e.g. "Sin cargo" or "ARS 5.000–8.000". */
  amount: string;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

interface Barrio {
  name: string;
  tier: TransportTier;
  key: string;
}

const BARRIOS: readonly Barrio[] = [
  ...FREE_BARRIOS.map((name) => ({ name, tier: "free" as const })),
  ...NEARBY_BARRIOS.map((name) => ({ name, tier: "nearby" as const })),
  ...FAR_BARRIOS.map((name) => ({ name, tier: "far" as const })),
]
  .map((b) => ({ ...b, key: normalize(b.name) }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

/** The listed barrio that matches `name` exactly (ignoring accents and case). */
export function findBarrio(name: string): string | null {
  const key = normalize(name);
  return key ? (BARRIOS.find((b) => b.key === key)?.name ?? null) : null;
}

/**
 * Barrios of Córdoba capital that match what the person is typing, best first:
 * those that start with it, then those that contain it.
 */
export function searchBarrios(query: string, limit = 8): string[] {
  const key = normalize(query);
  if (!key) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const b of BARRIOS) {
    if (b.key.startsWith(key)) starts.push(b.name);
    else if (b.key.includes(key)) contains.push(b.name);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Pickup cost for a barrio of Córdoba capital; null if it is not one. */
export function quoteTransport(neighborhood: string): TransportQuote | null {
  const key = normalize(neighborhood);
  const barrio = BARRIOS.find((b) => b.key === key);
  if (!barrio) return null;
  const { transportPricing } = businessConfig;
  if (barrio.tier === "free") {
    return { tier: "free", amount: transportPricing.freeText };
  }
  return barrio.tier === "nearby"
    ? { tier: "nearby", amount: transportPricing.nearbyRange }
    : { tier: "far", amount: transportPricing.farRange };
}
