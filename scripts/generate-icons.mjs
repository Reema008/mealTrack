// Generates the PWA PNG icons (no dependencies): a plate with a check mark.
// Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const EMERALD = [5, 150, 105];
const WHITE = [255, 255, 255];

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

/** scale < 1 shrinks the artwork (maskable safe zone). */
function art(x, y, scale) {
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  const d = dist(u, v, 0.5, 0.5);
  const check = Math.min(segDist(u, v, 0.36, 0.51, 0.46, 0.61), segDist(u, v, 0.46, 0.61, 0.65, 0.41)) < 0.035;
  if (check) return 'emerald';
  if (d < 0.25 && d > 0.215) return 'emerald'; // plate rim
  if (d < 0.32) return 'white';
  return null;
}

const solid = (rgb, a = 255) => [...rgb, a];

const fullBleed = (scale) => (x, y) => {
  const a = art(x, y, scale);
  return solid(a === 'white' ? WHITE : EMERALD);
};
const rounded = (x, y) => {
  if (!roundedSquare(x, y, 0.22)) return [0, 0, 0, 0];
  const a = art(x, y, 1);
  return solid(a === 'white' ? WHITE : EMERALD);
};
// Monochrome notification badge: white plate silhouette on transparent.
const badge = (x, y) => {
  const a = art(x, y, 1.35);
  return a === 'white' ? solid(WHITE) : [0, 0, 0, 0];
};

writeFileSync(new URL('icon-192.png', OUT), png(192, rounded));
writeFileSync(new URL('icon-512.png', OUT), png(512, rounded));
writeFileSync(new URL('icon-512-maskable.png', OUT), png(512, fullBleed(0.8)));
writeFileSync(new URL('apple-touch-icon.png', OUT), png(180, fullBleed(0.9)));
writeFileSync(new URL('badge-96.png', OUT), png(96, badge));
console.log('icons written to public/icons');
