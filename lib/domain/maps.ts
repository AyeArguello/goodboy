/**
 * Google Maps search link for a pickup address, so the owner can check where
 * to collect the dog. The city is appended: every address is in Córdoba capital.
 */
export function googleMapsSearchUrl(
  address: string,
  neighborhood?: string | null,
): string {
  const query = [address, neighborhood, "Córdoba", "Argentina"]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
