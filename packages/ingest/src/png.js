// Minimal PNG encoder using the standard CompressionStream('deflate') (zlib format),
// available in browsers, Web Workers and Node >= 18. Pure: no DOM, no I/O.

let CRC_TABLE = null;
function crc32(bytes, crc = 0xFFFFFFFF) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return crc;
}

async function deflate(bytes) {
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length)) ^ 0xFFFFFFFF;
  dv.setUint32(8 + data.length, crc >>> 0);
  return out;
}

/**
 * Encode raw pixels to PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Uint8ClampedArray} data  gray (1 channel), RGB (3) or RGBA (4)
 * @param {1|3|4} channels
 */
export async function encodePng(width, height, data, channels) {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Expand pdf.js image kinds to a plain channel layout. kind 1 = 1bpp gray, 2 = RGB, 3 = RGBA. */
export function imageToChannels(img) {
  const { width, height, kind, data } = img;
  if (kind === 2) return { data, channels: 3 };
  if (kind === 3) return { data, channels: 4 };
  if (kind === 1) {
    const out = new Uint8Array(width * height);
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      out[y * width + x] = bit ? 255 : 0;
    }
    return { data: out, channels: 1 };
  }
  return null;
}
