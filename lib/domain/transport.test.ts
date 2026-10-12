import { describe, expect, it } from "vitest";
import { findBarrio, quoteTransport, searchBarrios } from "./transport";

describe("quoteTransport one-way", () => {
  it.each(["pickup_only", "dropoff_only"] as const)(
    "%s costs half of the round trip",
    (mode) => {
      expect(quoteTransport("Jardin", mode)?.amount).toBe("ARS 2.500–4.000");
      expect(quoteTransport("Docta", mode)?.amount).toBe("ARS 5.000–6.500");
      expect(quoteTransport("Las Palmas", mode)?.amount).toBe("Sin cargo");
    },
  );

  it("the full pickup keeps the round-trip price", () => {
    expect(quoteTransport("Jardin", "pickup")?.amount).toBe("ARS 5.000–8.000");
  });
});

describe("quoteTransport", () => {
  it("charges nothing in Las Palmas, whatever the accents or case", () => {
    expect(quoteTransport("Las Palmas")).toEqual({
      tier: "free",
      amount: "Sin cargo",
    });
    expect(quoteTransport("  las  palmas ")?.tier).toBe("free");
  });

  it("gives the nearby range for Jardín", () => {
    expect(quoteTransport("Jardin")).toEqual({
      tier: "nearby",
      amount: "ARS 5.000–8.000",
    });
  });

  it("gives the far range for Docta", () => {
    expect(quoteTransport("Docta")).toEqual({
      tier: "far",
      amount: "ARS 10.000–13.000",
    });
  });

  it("has no quote for a place outside Córdoba capital", () => {
    expect(quoteTransport("Villa Carlos Paz")).toBeNull();
    expect(quoteTransport("")).toBeNull();
  });
});

describe("barrio search", () => {
  it("finds a barrio ignoring accents and case", () => {
    expect(findBarrio("nueva cordoba")).toBe("Nueva Córdoba");
    expect(findBarrio("Nowhere")).toBeNull();
  });

  it("lists the ones that start with the text before those that contain it", () => {
    const results = searchBarrios("jardin");
    expect(results.length).toBeGreaterThan(1);
    expect(results[0]).toMatch(/^Jard/);
    expect(searchBarrios("   ")).toEqual([]);
    expect(searchBarrios("jardin", 3)).toHaveLength(3);
  });
});
