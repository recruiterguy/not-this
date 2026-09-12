// Generates icons/icon{16,48,128}.png with no dependencies.
// Design: Reddit-orange rounded square, a white "picture frame", and a slash through it.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- Minimal PNG encoder -----------------------------------------------------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Shape helpers (unit square coordinates) --------------------------------
function inRoundedRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  if (dx <= 0 && dy <= 0) return true;
  if (dx > 0 && dy > 0) return dx * dx + dy * dy <= r * r;
  return Math.max(dx, dy) <= r;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

const ORANGE = [255, 69, 0];
const WHITE = [255, 255, 255];

function sampleColor(x, y) {
  // Background rounded square
  if (!inRoundedRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22)) return null;
  let color = ORANGE;

  // Picture frame: outer minus inner
  const frameOuter = inRoundedRect(x, y, 0.5, 0.5, 0.31, 0.24, 0.05);
  const frameInner = inRoundedRect(x, y, 0.5, 0.5, 0.24, 0.17, 0.02);
  if (frameOuter && !frameInner) color = WHITE;

  // Little "mountain + sun" inside the frame so it reads as a picture
  if (frameInner) {
    const sun = Math.hypot(x - 0.40, y - 0.42) <= 0.035;
    const mountain = y >= 0.48 + Math.abs(x - 0.56) * 1.1 && y <= 0.67;
    if (sun || mountain) color = WHITE;
  }

  // Diagonal slash with an orange outline so it separates from the frame
  const d = distToSegment(x, y, 0.20, 0.80, 0.80, 0.20);
  if (d <= 0.075) color = ORANGE;
  if (d <= 0.045) color = WHITE;

  return color;
}

function render(size) {
  const SS = 4; // supersampling
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const c = sampleColor(x, y);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return encodePNG(size, size, out);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log('wrote', path.relative(process.cwd(), file));
}
