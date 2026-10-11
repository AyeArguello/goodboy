import { describe, expect, it } from "vitest";
import { findBarrio, quoteTransport, searchBarrios } from "./transport";

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
