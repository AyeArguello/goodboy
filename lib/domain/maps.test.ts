import { describe, expect, it } from "vitest";
import { googleMapsSearchUrl } from "./maps";

describe("googleMapsSearchUrl", () => {
  it("searches the address with its barrio and the city", () => {
    const url = new URL(googleMapsSearchUrl("Platon 2995", "Zumarán"));
    expect(url.origin + url.pathname).toBe(
      "https://www.google.com/maps/search/",
    );
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(
      "Platon 2995, Zumarán, Córdoba, Argentina",
    );
  });

  it("copes with a missing barrio and extra spaces", () => {
    const url = new URL(googleMapsSearchUrl("  Obispo Trejo 100 ", null));
    expect(url.searchParams.get("query")).toBe(
      "Obispo Trejo 100, Córdoba, Argentina",
    );
  });
});
