// Generates the PWA icons from the app mark: a card with an accent gem.
// Hand-rolled signed-distance rasterizer + PNG encoder, so the repo carries no
// image tooling and the icons cannot drift from the SVG.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [10, 14, 23]; // #0a0e17
const INK = [231, 234, 242]; // #e7eaf2
const ACCENT = [61, 123, 255]; // #3d7bff

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Rounded-rectangle signed distance, in a 0..1 normalised box.
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

// The mark in a 0..1 box. `inset` shrinks the card for the maskable safe area.
function sample(x, y, inset) {
  const cx = 0.5;
  const cy = 0.5;
  const hw = 0.235 - inset;
  const hh = 0.33 - inset;
  const stroke = 0.036;
  const card = sdRoundRect(x, y, cx, cy, hw, hh, 0.055);
  if (Math.abs(card) <= stroke) return INK;

  // Accent gem: an L1 ball (a diamond), rotated 45 degrees by construction.
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  if (dx + dy <= 0.11) return ACCENT;

  return BG;
}

function render(size, inset) {
  const pixels = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, inset);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(acc[0] / n);
      pixels[i + 1] = Math.round(acc[1] / n);
      pixels[i + 2] = Math.round(acc[2] / n);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

const jobs = [
  [192, 0],
  [512, 0],
  [512, 0.06], // maskable: more breathing room inside the safe zone
];
for (const [size, inset] of jobs) {
  const name = inset > 0 ? `icon-${size}-maskable.png` : `icon-${size}.png`;
  writeFileSync(resolve(outDir, name), encodePng(size, render(size, inset)));
  console.log('wrote', name);
}
