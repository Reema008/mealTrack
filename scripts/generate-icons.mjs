// Generates the PWA PNG icons (no dependencies): a plate with a check mark.
// Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });


function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          acc = acc.map((v, i) => v + p[i]);
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const a = acc[3] / 16;
      for (let i = 0; i < 3; i++) raw[o + i] = a ? Math.round(acc[i] / 16 / (a / 255)) : 0;
      raw[o + 3] = Math.round(a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
function segDist(px, py, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}
function roundedSquare(x, y, r) {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BEIGE_LIGHT = hex('#f5ecdf');
const BEIGE = hex('#e6d6be');
const WOOD_TOP = hex('#9a6a43');
const WOOD_BOTTOM = hex('#7a5032');
const WOOD_RIM = hex('#b07d53');
const STEAM = hex('#a88a6c');
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Three wavy steam lines, sampled as short segments (matches icon.svg).
const steam = [0.36, 0.5, 0.64].map((cx) =>
  Array.from({ length: 25 }, (_, i) => {
    const y = 0.4 - (i / 24) * 0.25;
    return [cx + 0.032 * Math.sin((i / 24) * Math.PI * 2.4), y];
  }),
);
function nearSteam(u, v) {
  for (const line of steam)
    for (let i = 1; i < line.length; i++)
      if (segDist(u, v, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]) < 0.019) return true;
  return false;
}
/** Bowl artwork; returns a colour, or null for background. scale < 1 shrinks it (maskable safe zone). */
function art(x, y, scale) {
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;

  // Wooden bowl: lighter rim band, body darkening towards the bottom.
  if (v >= 0.5 && dist(u, v, 0.5, 0.5) <= 0.32) return v <= 0.545 ? WOOD_RIM : mix(WOOD_TOP, WOOD_BOTTOM, (v - 0.5) / 0.32);
  if (u >= 0.38 && u <= 0.62 && v >= 0.81 && v <= 0.86) return WOOD_BOTTOM; // foot
  if (nearSteam(u, v)) return STEAM;
  return null;
}

const background = (x, y) => mix(BEIGE_LIGHT, BEIGE, (x + y) / 2);
const solid = (rgb, a = 255) => [...rgb, a];

const fullBleed = (scale) => (x, y) => solid(art(x, y, scale) ?? background(x, y));
const rounded = (x, y) => (roundedSquare(x, y, 0.24) ? solid(art(x, y, 1) ?? background(x, y)) : [0, 0, 0, 0]);
// Monochrome notification badge: white bowl + steam silhouette on transparent.
const badge = (x, y) => (art(x, y, 1.25) ? solid([255, 255, 255]) : [0, 0, 0, 0]);

writeFileSync(new URL('icon-192.png', OUT), png(192, rounded));
writeFileSync(new URL('icon-512.png', OUT), png(512, rounded));
writeFileSync(new URL('icon-512-maskable.png', OUT), png(512, fullBleed(0.8)));
writeFileSync(new URL('apple-touch-icon.png', OUT), png(180, fullBleed(0.9)));
writeFileSync(new URL('badge-96.png', OUT), png(96, badge));
console.log('icons written to public/icons');
