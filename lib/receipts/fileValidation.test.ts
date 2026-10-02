import { describe, expect, it } from "vitest";
import {
  checkDeclaredFile,
  checkStoredContent,
  detectImageMime,
  extensionOf,
} from "./fileValidation";
import { MAX_RECEIPT_BYTES } from "./constants";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const PDF = new TextEncoder().encode("%PDF-1.7 fake");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

describe("extensionOf", () => {
  it("lowercases and handles edge cases", () => {
    expect(extensionOf("Comprobante.JPG")).toBe("jpg");
    expect(extensionOf("a.b.png")).toBe("png");
    expect(extensionOf("noext")).toBeNull();
    expect(extensionOf("trailing.")).toBeNull();
  });
});

describe("checkDeclaredFile", () => {
  it.each([
    ["foto.jpg", "image/jpeg"],
    ["foto.JPEG", "image/jpeg"],
    ["captura.png", "image/png"],
    ["captura.webp", "image/webp"],
  ])("accepts %s as %s", (name, type) => {
    expect(checkDeclaredFile({ name, type, size: 1000 })).toEqual({
      ok: true,
      mime: type,
    });
  });

  it("rejects empty and oversized files", () => {
    expect(
      checkDeclaredFile({ name: "a.jpg", type: "image/jpeg", size: 0 }),
    ).toMatchObject({ ok: false, code: "EMPTY" });
    expect(
      checkDeclaredFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: MAX_RECEIPT_BYTES + 1,
      }),
    ).toMatchObject({ ok: false, code: "TOO_LARGE" });
    expect(
      checkDeclaredFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: MAX_RECEIPT_BYTES,
      }),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ["doc.pdf", "application/pdf"],
    ["foto.heic", "image/heic"],
    ["anim.gif", "image/gif"],
    ["foto.jpg", "image/png"], // extension / MIME mismatch
    ["foto.png", "image/jpeg"],
    ["foto", "image/jpeg"], // no extension
    ["foto.jpg", ""], // browser gave no type
    ["script.js", "image/jpeg"],
  ])("rejects %s declared as %s", (name, type) => {
    expect(checkDeclaredFile({ name, type, size: 1000 })).toMatchObject({
      ok: false,
      code: "BAD_TYPE",
    });
  });
});

describe("detectImageMime / checkStoredContent", () => {
  it("detects real image types from magic bytes", () => {
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(WEBP)).toBe("image/webp");
    expect(detectImageMime(PDF)).toBeNull();
    expect(detectImageMime(HTML)).toBeNull();
    expect(detectImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageMime(new Uint8Array())).toBeNull();
  });

  it("accepts content matching the declared type", () => {
    expect(checkStoredContent(JPEG, "image/jpeg")).toEqual({
      ok: true,
      mime: "image/jpeg",
      ext: "jpg",
    });
    expect(checkStoredContent(PNG, "image/png")).toMatchObject({
      ok: true,
      ext: "png",
    });
    expect(checkStoredContent(WEBP, "image/webp")).toMatchObject({
      ok: true,
      ext: "webp",
    });
  });

  it("rejects disguised files (a PDF or HTML renamed to .jpg)", () => {
    expect(checkStoredContent(PDF, "image/jpeg")).toEqual({
      ok: false,
      code: "CONTENT_MISMATCH",
    });
    expect(checkStoredContent(HTML, "image/png")).toEqual({
      ok: false,
      code: "CONTENT_MISMATCH",
    });
  });

  it("rejects a real image declared as a different type", () => {
    expect(checkStoredContent(PNG, "image/jpeg")).toEqual({
      ok: false,
      code: "CONTENT_MISMATCH",
    });
  });

  it("rejects empty and oversized content", () => {
    expect(checkStoredContent(new Uint8Array(), "image/jpeg")).toEqual({
      ok: false,
      code: "EMPTY",
    });
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    big.set(JPEG);
    expect(checkStoredContent(big, "image/jpeg")).toEqual({
      ok: false,
      code: "TOO_LARGE",
    });
  });
});
