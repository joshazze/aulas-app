// Generates PNG icons (192, 512, 512-maskable) from a simple bitmap.
// Pure Node stdlib (zlib + custom CRC32) — no native deps.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// CRC32 ---------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// PNG builder ---------------------------------------------------
function buildPng(size, paint) {
  // paint(x, y) → [r, g, b, a]
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc(size * (1 + stride));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = rowStart + 1 + x * 4;
      raw[i] = r; raw[i+1] = g; raw[i+2] = b; raw[i+3] = a;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Drawing helpers ----------------------------------------------
const BG = [10, 10, 11, 255];
const TEAL_A = [94, 234, 212, 255];
const TEAL_B = [45, 212, 191, 255];
const DARK = [10, 10, 11, 255];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ];
}

function paintIcon(x, y, size) {
  // Coords normalised to 512 space
  const sx = (x / size) * 512;
  const sy = (y / size) * 512;
  // Outer rounded rect — bg color always (we add a margin)
  const margin = 0;
  if (sx < margin || sy < margin || sx > 512 - margin || sy > 512 - margin) return BG;

  // Card body 64..448 x 120..432, rounded 36
  if (insideRoundRect(sx, sy, 64, 120, 384, 312, 36)) {
    // Top strip 80px (120..200) — dark overlay
    let color = mix(TEAL_A, TEAL_B, (sx - 64) / 384);
    if (sy < 200) color = mix(color, DARK, 0.18);
    // Calendar squares row by row
    const cellW = 56, cellH = 40, gap = 12;
    const cols = [120, 228, 336];
    const rows = [240, 300, 360];
    const pattern = [
      [1,1,0],
      [0,1,1],
      [1,0,1],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x0 = cols[c], y0 = rows[r];
        if (sx >= x0 && sx < x0 + cellW && sy >= y0 && sy < y0 + cellH) {
          // Rounded 6 corners
          const inX = sx - x0, inY = sy - y0;
          if (inCornerRadius(inX, inY, cellW, cellH, 6)) {
            color = pattern[r][c] ? DARK : mix(DARK, color, 0.65);
          }
        }
      }
    }
    return color;
  }

  // Rings on top (clock-like): two circles at y=100, x=160 and x=352 radius 22, with bars y=80..140, x=148..172 / 340..364
  // Bars
  if ((sx >= 148 && sx < 172 && sy >= 80 && sy < 140) ||
      (sx >= 340 && sx < 364 && sy >= 80 && sy < 140)) {
    return DARK;
  }
  if (inCircle(sx, sy, 160, 100, 22) || inCircle(sx, sy, 352, 100, 22)) return DARK;

  return BG;
}

function paintMaskable(x, y, size) {
  // Maskable needs a safe zone — 80% center area is safe
  // Render the icon but scaled smaller (centered) and the rest is solid teal
  // Safer: solid color background, simple "A" shape
  const cx = size / 2, cy = size / 2;
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > size * 0.48) return BG;
  // "A" letter as triangle
  const ay = (y - size * 0.25) / (size * 0.5);
  if (ay >= 0 && ay <= 1) {
    const halfW = ay * size * 0.18;
    const center = size / 2;
    if (Math.abs(x - center) < halfW && Math.abs(x - center) > halfW - size * 0.04) return DARK;
    if (Math.abs(x - center) < halfW && Math.abs(ay - 0.55) < 0.06) return DARK;
  }
  // Gradient bg
  return mix(TEAL_A, TEAL_B, (x / size + y / size) / 2);
}

function insideRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const ix = x - rx, iy = y - ry;
  const checkCorner = (cx, cy) => {
    const dx = ix - cx, dy = iy - cy;
    return dx * dx + dy * dy <= r * r;
  };
  if (ix < r && iy < r) return checkCorner(r, r);
  if (ix > w - r && iy < r) return checkCorner(w - r, r);
  if (ix < r && iy > h - r) return checkCorner(r, h - r);
  if (ix > w - r && iy > h - r) return checkCorner(w - r, h - r);
  return true;
}

function inCornerRadius(x, y, w, h, r) {
  // For small rounded squares — same idea
  const checkCorner = (cx, cy) => {
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  if (x < r && y < r) return checkCorner(r, r);
  if (x > w - r && y < r) return checkCorner(w - r, r);
  if (x < r && y > h - r) return checkCorner(r, h - r);
  if (x > w - r && y > h - r) return checkCorner(w - r, h - r);
  return true;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Generate -----------------------------------------------------
const targets = [
  { name: 'icon-192.png',          size: 192, paint: paintIcon },
  { name: 'icon-512.png',          size: 512, paint: paintIcon },
  { name: 'icon-512-maskable.png', size: 512, paint: paintMaskable },
];

for (const t of targets) {
  const png = buildPng(t.size, t.paint);
  writeFileSync(resolve(outDir, t.name), png);
  console.log(`✔ ${t.name} (${t.size}×${t.size}, ${png.length} bytes)`);
}
