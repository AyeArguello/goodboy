import { describe, expect, it } from "vitest";
import { readImageSize } from "./imageSize";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function png(width: number, height: number): Uint8Array {
  const be = (n: number) => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    ...ascii("IHDR"),
    ...be(width),
    ...be(height),
    8,
    6,
    0,
    0,
    0,
  ]);
}

function webpExtended(width: number, height: number): Uint8Array {
  const le3 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
  return Uint8Array.from([
    ...ascii("RIFF"),
    0,
    0,
    0,
    0,
    ...ascii("WEBP"),
    ...ascii("VP8X"),
    10,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    ...le3(width - 1),
    ...le3(height - 1),
  ]);
}

function webpLossy(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    ...ascii("RIFF"),
    0,
    0,
    0,
    0,
    ...ascii("WEBP"),
    ...ascii("VP8 "),
    0,
    0,
    0,
    0, // chunk size
    0,
    0,
    0, // frame tag
    0x9d,
    0x01,
    0x2a, // start code
    width & 255,
    width >> 8,
    height & 255,
    height >> 8,
  ]);
}

function webpLossless(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return Uint8Array.from([
    ...ascii("RIFF"),
    0,
    0,
    0,
    0,
    ...ascii("WEBP"),
    ...ascii("VP8L"),
    0,
    0,
    0,
    0,
    0x2f,
    w & 255,
    ((w >> 8) & 0x3f) | ((h & 3) << 6),
    (h >> 2) & 255,
    (h >> 10) & 0x0f,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    4,
    0,
    0, // an APP0 segment to skip over
    0xff,
    0xc0,
    0,
    11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    1,
    0x11,
    0,
  ]);
}

describe("readImageSize", () => {
  it("reads a PNG", () => {
    expect(readImageSize(png(800, 1200))).toEqual({ width: 800, height: 1200 });
  });

  it("reads the three kinds of WebP", () => {
    expect(readImageSize(webpExtended(1600, 900))).toEqual({
      width: 1600,
      height: 900,
    });
    expect(readImageSize(webpLossy(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
    expect(readImageSize(webpLossless(321, 1234))).toEqual({
      width: 321,
      height: 1234,
    });
  });

  it("reads a JPEG, skipping the segments before the frame", () => {
    expect(readImageSize(jpeg(1000, 750))).toEqual({
      width: 1000,
      height: 750,
    });
  });

  it("returns null for anything else or a truncated file", () => {
    expect(
      readImageSize(Uint8Array.from(ascii("GIF89a...................."))),
    ).toBeNull();
    expect(readImageSize(new Uint8Array(4))).toBeNull();
    expect(readImageSize(png(10, 10).slice(0, 12))).toBeNull();
    expect(readImageSize(png(0, 0))).toBeNull();
  });
});
