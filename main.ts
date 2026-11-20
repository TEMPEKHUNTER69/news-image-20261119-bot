// THE WORLD TODAY — Thursday 19 November 2026, in one image.
//
// A newspaper front page drawn procedurally into a 1024x1024 RGB buffer:
// a hand-written 5x7 bitmap font, simple shapes for the illustrations
// (skyline and flags, scales of justice, a broken bridge, a tanker and a
// mine, a rising market chart), and a hand-written PNG encoder built on
// node:zlib with a CRC32 table computed in code. No network, no clock,
// no randomness: two runs write byte-identical PNGs.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The day's news, all first reported on 19 November 2026:
//   - Trump, Xi and Putin meet in Shenzhen, the first three-way summit,
//     ending with a four-point peace declaration and no deal on Ukraine
//     or Iran.
//   - The International Court of Justice rules Myanmar committed
//     genocide against the Rohingya.
//   - Ukraine strikes the Crimea bridge a third time; rail traffic halted.
//   - Iran widens its Gulf attacks; three tankers burn near Hormuz.
//   - Anthropic prices its IPO at $83 a share, about $81bn raised.
//   - Also: GTA VI launches, Cyclone Akvan evacuates 80,000 in Odisha,
//     a Van Gogh sells for $190.4m, Bitcoin slips below $63,000.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// Palette: newsprint paper, ink, and a restrained red / blue / gold.
const PAPER: RGB = [252, 248, 239];
const INK: RGB = [22, 22, 22];
const RED: RGB = [178, 28, 28];
const BLUE: RGB = [29, 78, 180];
const GOLD: RGB = [184, 134, 22];
const GREY: RGB = [112, 110, 104];
const FAINT: RGB = [233, 227, 214];
const WHITE: RGB = [255, 255, 255];
const SKY: RGB = [198, 224, 242];
const SEA: RGB = [36, 88, 138];
const GREEN: RGB = [34, 110, 72];

type RGB = [number, number, number];

// The picture, one RGB byte per channel, row by row.
const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = PAPER[0];
  px[i * 3 + 1] = PAPER[1];
  px[i * 3 + 2] = PAPER[2];
}

function set(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  px[o] = c[0];
  px[o + 1] = c[1];
  px[o + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const o = (yy * W + xx) * 3;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
    }
  }
}

function hline(x: number, y: number, w: number, c: RGB): void {
  fillRect(x, y, w, 1, c);
}

function vline(x: number, y: number, h: number, c: RGB): void {
  fillRect(x, y, 1, h, c);
}

// Bresenham line, 1px wide.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    set(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// A thick line drawn as a row of offset 1px lines.
function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  for (let i = 0; i < t; i++) {
    line(x0, y0 + i, x1, y1 + i, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) {
      set(cx + x, cy + y, c);
    }
  }
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    set(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

function outlineRect(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

// ---- PNG encoding (IHDR / IDAT with zlib level 9 / IEND) ----

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function pngEncode(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font ----
// Each glyph is 7 rows of 5 cells; '#' is ink, '.' is blank. Letters are
// drawn solid and blocky on purpose: they stay readable when the page is
// shrunk, which is how a picture editor first sees a front page.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...##', '..#..', '.#...', '.#...', '.#...', '..#..', '...##'],
  ')': ['##...', '..#..', '...#.', '...#.', '...#.', '..#..', '##...'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '&': ['.##..', '#..#.', '#..#.', '.#...', '#.#.#', '#..#.', '.##.#'],
};

function drawChar(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch];
  if (!g) return;
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row[col] === '#') fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}

// One character cell is 6*s wide (5 for the glyph, 1 for the gap).
function textWidth(text: string, s: number): number {
  return text.length * 6 * s - s;
}

function drawText(text: string, x: number, y: number, s: number, c: RGB): void {
  // The font holds capitals only; body copy is set in capitals, as on a
  // printed front page, so anything lowercase is raised here.
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    drawChar(upper[i], x + i * 6 * s, y, s, c);
  }
}

function drawTextCentered(text: string, cx: number, y: number, s: number, c: RGB): void {
  drawText(text, cx - Math.floor(textWidth(text, s) / 2), y, s, c);
}

// Greedy word wrap into lines no wider than maxW.
function wrapText(text: string, maxW: number, s: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : cur + ' ' + w;
    if (textWidth(next, s) <= maxW) {
      cur = next;
    } else {
      if (cur !== '') lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function drawPara(text: string, x: number, y: number, maxW: number, s: number, c: RGB, leading: number): number {
  const lines = wrapText(text, maxW, s);
  for (let i = 0; i < lines.length; i++) {
    drawText(lines[i], x, y + i * leading, s, c);
  }
  return y + lines.length * leading;
}

// ---- Illustrations: plain shapes, each inside its own box ----

// Shenzhen skyline under three flags: the US, China and Russia.
function drawSkylineFlags(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  // Sun and clouds.
  fillCircle(x + w - 34, y + 30, 16, GOLD);
  fillCircle(x + 52, y + 26, 10, WHITE);
  fillCircle(x + 66, y + 22, 12, WHITE);
  fillCircle(x + 80, y + 27, 9, WHITE);
  // Skyline silhouettes along the bottom.
  const base = y + h;
  const towers: [number, number][] = [
    [0, 96], [34, 128], [72, 84], [104, 142], [142, 110],
    [176, 152], [212, 96], [246, 132], [280, 88],
  ];
  for (const [tx, th] of towers) {
    fillRect(x + tx, base - th, 30, th, INK);
  }
  // A few lit windows.
  for (let i = 0; i < 12; i++) {
    const wx = x + 8 + (i * 23) % (w - 16);
    const wy = base - 40 - ((i * 37) % 90);
    fillRect(wx, wy, 4, 5, GOLD);
  }
  // Three flag poles with small flags, left to right: US, China, Russia.
  const poleTops = y + 18;
  const flagY = y + 22;
  const flagW = 34;
  const flagH = 22;
  const poleXs = [x + 52, x + w / 2 - 6, x + w - 86];
  for (const px0 of poleXs) {
    vline(px0, poleTops, h - 18, INK);
  }
  // US flag: red and white stripes, blue canton.
  const ux = poleXs[0] + 2;
  for (let s = 0; s < 7; s++) {
    fillRect(ux, flagY + s * 3, flagW, 3, s % 2 === 0 ? RED : WHITE);
  }
  fillRect(ux, flagY, 15, 12, BLUE);
  fillRect(ux + 3, flagY + 3, 2, 2, WHITE);
  fillRect(ux + 9, flagY + 7, 2, 2, WHITE);
  // China flag: red field, five gold stars as dots.
  const cx = poleXs[1] + 2;
  fillRect(cx, flagY, flagW, flagH, RED);
  fillCircle(cx + 7, flagY + 7, 3, GOLD);
  fillCircle(cx + 16, flagY + 4, 2, GOLD);
  fillCircle(cx + 22, flagY + 7, 2, GOLD);
  fillCircle(cx + 20, flagY + 13, 2, GOLD);
  fillCircle(cx + 14, flagY + 16, 2, GOLD);
  // Russia flag: white, blue and red bands.
  const rx = poleXs[2] + 2;
  fillRect(rx, flagY, flagW, 7, WHITE);
  fillRect(rx, flagY + 7, flagW, 7, BLUE);
  fillRect(rx, flagY + 14, flagW, 8, RED);
  outlineRect(x, y, w, h, 2, INK);
}

// Scales of justice, for the Hague ruling.
function drawScales(x: number, y: number, w: number, h: number): void {
  const cx = x + Math.floor(w / 2);
  const top = y + 12;
  const base = y + h - 10;
  // Base and post.
  thickLine(x + 14, base, x + w - 14, base, 3, INK);
  thickLine(cx, top + 8, cx, base, 3, INK);
  // Top bar.
  thickLine(cx - 46, top + 8, cx + 46, top + 8, 3, INK);
  // Pans hang from the bar ends.
  for (const px0 of [cx - 46, cx + 46]) {
    line(px0, top + 10, px0 - 16, top + 44, INK);
    line(px0, top + 10, px0 + 16, top + 44, INK);
    hline(px0 - 16, top + 44, 33, INK);
    fillCircle(px0, top + 46, 13, GOLD);
    fillRect(px0 - 13, top + 33, 26, 13, PAPER);
  }
  // Finial on top.
  fillCircle(cx, top + 2, 4, RED);
}

// A bridge over water with a broken span and smoke, for the Crimea strike.
function drawBridge(x: number, y: number, w: number, h: number): void {
  const seaY = y + h - 26;
  fillRect(x, seaY, w, h - (seaY - y), SEA);
  // Wave lines.
  for (let i = 0; i < 4; i++) {
    const wy = seaY + 6 + i * 5;
    for (let wx = x + (i % 2) * 12; wx < x + w - 10; wx += 24) {
      hline(wx, wy, 12, WHITE);
    }
  }
  // Towers.
  fillRect(x + 34, y + 18, 10, seaY - y - 18, INK);
  fillRect(x + w - 44, y + 18, 10, seaY - y - 18, INK);
  // Deck in two pieces with a gap in the middle.
  const deckY = y + 34;
  thickLine(x + 6, deckY, x + Math.floor(w / 2) - 22, deckY, 4, INK);
  thickLine(x + Math.floor(w / 2) + 22, deckY, x + w - 6, deckY, 4, INK);
  // Jagged broken ends at the gap.
  line(x + Math.floor(w / 2) - 22, deckY, x + Math.floor(w / 2) - 12, deckY + 10, INK);
  line(x + Math.floor(w / 2) + 22, deckY, x + Math.floor(w / 2) + 12, deckY + 10, INK);
  // Arch over the deck, drawn as short line segments so it stays solid.
  let prevX = -1;
  let prevY = -1;
  for (let a = 180; a <= 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    const ax = Math.round(x + w / 2 + (w / 2 - 30) * Math.cos(rad));
    const ay = Math.round(deckY - 4 + 26 * Math.sin(rad));
    if (prevX >= 0) line(prevX, prevY, ax, ay, INK);
    prevX = ax;
    prevY = ay;
  }
  // Smoke above the gap.
  fillCircle(x + Math.floor(w / 2) - 8, y + 8, 7, GREY);
  fillCircle(x + Math.floor(w / 2) + 6, y + 4, 9, GREY);
  fillCircle(x + Math.floor(w / 2) + 16, y + 12, 6, GREY);
}

// A tanker and a naval mine on a grey sea, for the Hormuz attacks.
function drawTanker(x: number, y: number, w: number, h: number): void {
  const seaY = y + h - 30;
  fillRect(x, seaY, w, h - (seaY - y), SEA);
  for (let i = 0; i < 3; i++) {
    const wy = seaY + 7 + i * 7;
    for (let wx = x + (i % 2) * 14; wx < x + w - 12; wx += 28) {
      hline(wx, wy, 14, WHITE);
    }
  }
  // Hull: a long low block with a slanted bow.
  const hullY = seaY - 16;
  fillRect(x + 12, hullY, w - 52, 16, RED);
  line(x + w - 40, hullY, x + w - 12, hullY + 16, RED);
  line(x + w - 40, hullY + 1, x + w - 13, hullY + 15, RED);
  // Containers on deck.
  fillRect(x + 22, hullY - 12, 26, 12, BLUE);
  fillRect(x + 52, hullY - 12, 26, 12, GOLD);
  fillRect(x + 82, hullY - 12, 26, 12, GREEN);
  // Bridge tower and funnel with smoke.
  fillRect(x + w - 58, hullY - 26, 14, 26, WHITE);
  outlineRect(x + w - 58, hullY - 26, 14, 26, 1, INK);
  fillRect(x + w - 76, hullY - 20, 10, 20, INK);
  fillCircle(x + w - 71, hullY - 28, 6, GREY);
  fillCircle(x + w - 62, hullY - 34, 8, GREY);
  // Naval mine: a spiked ball drifting ahead of the ship.
  const mx = x + w - 30;
  const my = seaY + 12;
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    line(
      Math.round(mx + 6 * Math.cos(rad)),
      Math.round(my + 6 * Math.sin(rad)),
      Math.round(mx + 12 * Math.cos(rad)),
      Math.round(my + 12 * Math.sin(rad)),
      INK,
    );
  }
  fillCircle(mx, my, 7, INK);
}

// A rising market line with an arrowhead.
function drawChart(x: number, y: number, w: number, h: number): void {
  // Axes.
  vline(x, y, h, INK);
  hline(x, y + h - 1, w, INK);
  // The line climbs, dips once, then climbs again.
  const pts: [number, number][] = [
    [4, h - 14], [w * 0.2, h - 22], [w * 0.38, h - 16],
    [w * 0.55, h - 34], [w * 0.72, h - 44], [w - 8, h - 58],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    thickLine(
      Math.round(x + pts[i][0]), Math.round(y + pts[i][1]),
      Math.round(x + pts[i + 1][0]), Math.round(y + pts[i + 1][1]),
      3, GREEN,
    );
  }
  const [ex, ey] = pts[pts.length - 1];
  line(Math.round(x + ex), Math.round(y + ey), Math.round(x + ex) - 10, Math.round(y + ey) + 2, GREEN);
  line(Math.round(x + ex), Math.round(y + ey), Math.round(x + ex) - 3, Math.round(y + ey) + 10, GREEN);
  for (const [px0, py0] of pts) {
    fillCircle(Math.round(x + px0), Math.round(y + py0), 3, GREEN);
  }
}

// ---- The front page ----

const MX = 32; // left margin of the text columns
const RX = 992; // right edge of the text columns

function rule(y: number, t: number, c: RGB): void {
  fillRect(MX, y, RX - MX, t, c);
}

function bullet(x: number, y: number): void {
  fillRect(x, y + 3, 8, 8, RED);
}

function main(): void {
  // Double-ruled frame.
  outlineRect(16, 16, 992, 992, 3, INK);
  outlineRect(24, 24, 976, 976, 1, INK);

  // Masthead.
  drawTextCentered('THE WORLD TODAY', W / 2, 40, 7, INK);
  fillRect(MX, 100, RX - MX, 6, RED);
  drawTextCentered('THURSDAY 19 NOVEMBER 2026', W / 2, 114, 3, INK);
  rule(140, 3, INK);

  // ---- Lead: the Shenzhen summit ----
  drawText('SHENZHEN SUMMIT', MX, 160, 2, RED);
  drawText('TRUMP, XI AND PUTIN', MX, 186, 4, INK);
  drawText('MEET IN SHENZHEN', MX, 218, 4, INK);
  const leadEnd = drawPara(
    'First three-way summit ends with a four-point peace declaration - but no deal on Ukraine or Iran.',
    MX, 258, 616, 2, INK, 26,
  );
  drawPara(
    'The three leaders pledged more talks on cutting nuclear risks.',
    MX, leadEnd + 8, 616, 2, INK, 26,
  );
  drawText('Trump on Iran: "See what happens after January 1."', MX, 376, 2, GREY);
  drawSkylineFlags(664, 152, 328, 248);

  rule(412, 2, INK);

  // ---- Middle row: The Hague and the Crimea bridge ----
  drawText('THE HAGUE', MX, 432, 2, RED);
  drawText('UN COURT: MYANMAR', MX, 458, 3, INK);
  drawText('COMMITTED GENOCIDE', MX, 482, 3, INK);
  drawText('AGAINST ROHINGYA', MX, 506, 3, INK);
  drawPara(
    'Gambia brought the case in 2019. The court found genocidal intent in Rakhine State.',
    MX, 540, 468, 2, INK, 24,
  );
  drawScales(MX, 620, 468, 72);

  vline(512, 424, 276, GREY);

  drawText('UKRAINE', 524, 432, 2, RED);
  drawText('UKRAINE HITS CRIMEA', 524, 458, 3, INK);
  drawText('BRIDGE A THIRD TIME', 524, 482, 3, INK);
  drawPara(
    'Rail section struck and train traffic halted in the third attack on the bridge this week.',
    524, 516, 468, 2, INK, 24,
  );
  drawBridge(524, 600, 468, 92);

  rule(712, 2, INK);

  // ---- Bottom band: the Gulf and the markets ----
  drawText('THE GULF', MX, 732, 2, RED);
  drawText('IRAN WIDENS GULF STRIKES', MX, 758, 3, INK);
  drawPara(
    'Three tankers caught fire after hitting mines near the Strait of Hormuz. The US blockade holds.',
    MX, 792, 420, 2, INK, 24,
  );
  drawTanker(468, 724, 152, 156);

  outlineRect(644, 724, 348, 156, 2, INK);
  drawText('MARKETS', 660, 736, 3, INK);
  drawChart(660, 764, 316, 40);
  drawText('ANTHROPIC IPO: $83 A SHARE', 660, 814, 2, INK);
  drawText('$81BN RAISED, A RECORD', 660, 838, 2, INK);
  drawText('BITCOIN BELOW $63,000', 660, 862, 2, INK);

  rule(892, 2, INK);

  // ---- Footer: also today ----
  drawText('ALSO TODAY', MX, 904, 2, RED);
  bullet(MX, 930);
  drawText('GTA VI OUT TODAY AFTER A 13-YEAR WAIT', MX + 18, 930, 2, INK);
  bullet(MX, 954);
  drawText('CYCLONE AKVAN: 80,000 EVACUATED IN ODISHA', MX + 18, 954, 2, INK);
  bullet(MX, 978);
  drawText('VAN GOGH SELLS FOR $190.4M, A RECORD', MX + 18, 978, 2, INK);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), pngEncode(W, H, px));
}

main();
