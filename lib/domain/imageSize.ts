export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Reads the pixel size straight from the file header of a PNG, JPEG or WebP,
 * so the server never has to trust the dimensions a browser reports. Returns
 * null when the bytes are not one of those formats or the header is cut short.
 * Plain TypeScript with no imports so scripts can load it directly.
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  return readPng(bytes) ?? readWebp(bytes) ?? readJpeg(bytes);
}

const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function readPng(b: Uint8Array): ImageSize | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || signature.some((byte, i) => b[i] !== byte)) return null;
  return valid(u32be(b, 16), u32be(b, 20));
}

function readWebp(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const text = (start: number) =>
    String.fromCharCode(b[start]!, b[start + 1]!, b[start + 2]!, b[start + 3]!);
  if (text(0) !== "RIFF" || text(8) !== "WEBP") return null;

  const chunk = text(12);
  if (chunk === "VP8X") {
    const width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return valid(width, height);
  }
  if (chunk === "VP8L") {
    const width = 1 + (((b[22]! & 0x3f) << 8) | b[21]!);
    const height =
      1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6));
    return valid(width, height);
  }
  if (chunk === "VP8 ") {
    const width = (b[26]! | (b[27]! << 8)) & 0x3fff;
    const height = (b[28]! | (b[29]! << 8)) & 0x3fff;
    return valid(width, height);
  }
  return null;
}

function readJpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Start-of-frame markers carry the size; C4, C8 and CC are not frames.
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) return valid(u16be(b, i + 7), u16be(b, i + 5));
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}
