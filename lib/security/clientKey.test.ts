import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerStore.get(name) ?? null,
  }),
}));
// The real hash needs the server env; the identity itself is what is under test.
vi.mock("@/lib/security/rateLimitKey", () => ({
  hashClientKey: (raw: string) => `hashed:${raw}`,
}));

import { getClientKey } from "./clientKey";

describe("getClientKey on Netlify (NETLIFY=true)", () => {
  beforeEach(() => {
    headerStore.clear();
    vi.stubEnv("NETLIFY", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses only the platform header, ignoring a forged x-forwarded-for", async () => {
    headerStore.set("x-nf-client-connection-ip", "203.0.113.7");
    headerStore.set("x-forwarded-for", "10.9.9.9, 198.51.100.1");
    headerStore.set("x-real-ip", "10.8.8.8");
    expect(await getClientKey()).toBe("hashed:203.0.113.7");
  });

  it("does not fall back to a forged x-forwarded-for when the Netlify header is missing", async () => {
    headerStore.set("x-forwarded-for", "10.6.6.6");
    headerStore.set("x-real-ip", "10.7.7.7");
    expect(await getClientKey()).toBe("hashed:unknown");
  });

  it("treats a blank Netlify header as missing", async () => {
    headerStore.set("x-nf-client-connection-ip", "   ");
    headerStore.set("x-forwarded-for", "10.4.4.4");
    expect(await getClientKey()).toBe("hashed:unknown");
  });

  it("gives different callers different keys (so a real limit still applies)", async () => {
    headerStore.set("x-nf-client-connection-ip", "203.0.113.1");
    const first = await getClientKey();
    headerStore.set("x-nf-client-connection-ip", "203.0.113.2");
    expect(await getClientKey()).not.toBe(first);
  });
});

describe("getClientKey outside Netlify (development, CI, tests)", () => {
  beforeEach(() => {
    headerStore.clear();
    vi.stubEnv("NETLIFY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the first x-forwarded-for entry", async () => {
    headerStore.set("x-forwarded-for", "10.1.2.3, 198.51.100.1");
    expect(await getClientKey()).toBe("hashed:10.1.2.3");
  });

  it("then x-real-ip, then a constant", async () => {
    headerStore.set("x-real-ip", "192.0.2.5");
    expect(await getClientKey()).toBe("hashed:192.0.2.5");
    headerStore.clear();
    expect(await getClientKey()).toBe("hashed:unknown");
  });

  it("still prefers the platform header when one is present", async () => {
    headerStore.set("x-nf-client-connection-ip", "203.0.113.7");
    headerStore.set("x-forwarded-for", "10.9.9.9");
    expect(await getClientKey()).toBe("hashed:203.0.113.7");
  });

  it("NETLIFY set to anything but 'true' is not Netlify", async () => {
    vi.stubEnv("NETLIFY", "false");
    headerStore.set("x-forwarded-for", "10.5.5.5");
    expect(await getClientKey()).toBe("hashed:10.5.5.5");
  });
});
