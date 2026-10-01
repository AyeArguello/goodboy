// Vitest doesn't do the client/server module-graph analysis Next's bundler
// does, so the real `server-only` package (which just throws unconditionally
// on import) would break every unit test that imports server code. Alias it
// to this no-op instead — see vitest.config.ts.
export {};
