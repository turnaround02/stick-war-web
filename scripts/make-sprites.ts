/**
 * Sprite asset pipeline: converts the style-B pixel-art samples in
 * docs/samples/ into transparent PNGs in public/sprites/ for runtime use.
 *
 * Usage: npx tsx scripts/make-sprites.ts
 *
 * Per unit type:
 *   1. Load docs/samples/<file> (1024² RGBA, solid dark background).
 *   2. Sample the background reference colour from the four corners.
 *   3. Flood-fill from the image borders over pixels within `tol` of the
 *      background colour → those become transparent. Flood-fill (not a
 *      global tolerance pass) stops at the amber rim-light halo, which keeps
 *      the glow attached to the character instead of speckling the whole
 *      frame.
 *   4. Keep only the largest opaque connected component (drops stray glow
 *      blobs / light-source flares disconnected from the figure).
 *   5. Remove enclosed background-coloured pockets (regions the flood could
 *      not reach, e.g. gaps fully surrounded by the glow ring) whose colour
 *      is still within `holeTol` of the background.
 *   6. Crop to the alpha bounding box, resize to the type's target height
 *      with nearest-neighbour (crisp pixel-art edges), write
 *      public/sprites/<type>.png.
 *
 * One-shot build step. Not part of the sim; no determinism impact — Phaser
 * loads the rendered PNGs at runtime.
 */

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

interface SpriteConfig {
  /** Unit type ID (key into UNITS / PALETTES). */
  type: string;
  /** Source sample file name in docs/samples/. */
  source: string;
  /** Target sprite height in px (at 1.0× camera, before VISUAL_SCALE). */
  targetH: number;
  /** Flood-fill tolerance: max RGB distance from the bg colour for a
   *  border-connected pixel to be keyed out. */
  tol: number;
}

/** Uniform flood tolerance — see the SPRITES doc comment for why it is low. */
const FLOOD_TOL = 16;

/**
 * Target heights: regular skeletal stickman ≈ 53 px tall; 48 is the visual
 * anchor (leaves room for the ground line and shadow). Giant = 1.5× = 72.
 *
 * Flood tolerance: uniform 16 across all types (verified by a visual tol
 * sweep on the light-background contact sheet). The characters' dark armour
 * and boots sit only ~20-40 RGB units from the background colour, so any
 * higher tolerance lets the flood leak inward and eat the legs/armour;
 * tol=16 still clears the background cleanly because the backdrop is
 * near-uniform (corner samples 10-24 RGB). If samples are regenerated,
 * re-run the sweep before changing this.
 */
const SPRITES: readonly SpriteConfig[] = [
  { type: 'miner',     source: 'miner-style-b.png',        targetH: 48, tol: FLOOD_TOL },
  { type: 'swordsman', source: 'swordsman-style-b.png',    targetH: 48, tol: FLOOD_TOL },
  { type: 'archer',    source: 'archer-style-b.png',       targetH: 48, tol: FLOOD_TOL },
  { type: 'spearman',  source: 'spearman-style-b.png',     targetH: 48, tol: FLOOD_TOL },
  { type: 'giant',     source: 'giant-style-b-modern.png', targetH: 72, tol: FLOOD_TOL },
  { type: 'mage',      source: 'mage-style-b.png',         targetH: 48, tol: FLOOD_TOL },
];

interface Img { w: number; h: number; data: Uint8ClampedArray }

async function load(p: string): Promise<Img> {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width!, h: info.height!, data: new Uint8ClampedArray(data) };
}

/** Average a 4×4 block at each corner → background reference colour. */
function cornerBg(img: Img): [number, number, number] {
  const { w, h, data } = img;
  const acc: [number, number, number] = [0, 0, 0];
  const blocks: ReadonlyArray<readonly [number, number]> = [[0, 0], [w - 4, 0], [0, h - 4], [w - 4, h - 4]];
  for (const [x0, y0] of blocks) {
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const i = ((y0 + dy) * w + (x0 + dx)) * 4;
        acc[0] += data[i]!; acc[1] += data[i + 1]!; acc[2] += data[i + 2]!;
      }
    }
  }
  return [Math.round(acc[0] / 64), Math.round(acc[1] / 64), Math.round(acc[2] / 64)];
}

function dist2(img: Img, p: number, bg: [number, number, number]): number {
  const i = p * 4;
  const dr = img.data[i]! - bg[0], dg = img.data[i + 1]! - bg[1], db = img.data[i + 2]! - bg[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Flood from the borders: every pixel reachable from the frame edge without
 * crossing a pixel more than `tol` away from the bg colour becomes
 * transparent (alpha 0 in the returned mask; 255 = opaque).
 */
function keyFlood(img: Img, bg: [number, number, number], tol: number): Uint8Array {
  const { w, h } = img;
  const alpha = new Uint8Array(w * h).fill(255);
  const seen = new Uint8Array(w * h);
  const st: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1; st.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  const t2 = tol * tol;
  while (st.length) {
    const p = st.pop()!;
    if (dist2(img, p, bg) > t2) continue;
    alpha[p] = 0;
    const x = p % w, y = (p / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return alpha;
}

/** Zero every opaque blob except the largest one. Returns kept pixel count. */
function largestBlob(alpha: Uint8Array, w: number, h: number): number {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!alpha[i] || seen[i]) continue;
    const cells: number[] = [];
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const p = st.pop()!;
      cells.push(p);
      const x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (alpha[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    if (cells.length > best.length) best = cells;
  }
  alpha.fill(0);
  for (const p of best) alpha[p] = 255;
  return best.length;
}

/**
 * The glow halo can fully enclose background pockets the border flood never
 * reaches. Any OPAQUE pixel within `holeTol` of the bg colour whose region is
 * not border-connected is such a pocket → make transparent. The giant's dark
 * armour also sits close to the bg colour, so `holeTol` must be tighter than
 * the flood tolerance to avoid eating the armour from the inside.
 */
function clearEnclosedBg(img: Img, alpha: Uint8Array, bg: [number, number, number], holeTol: number): void {
  const { w, h } = img;
  // Regions of NON-transparent pixels reachable from the border (the figure
  // itself) — pockets are opaque regions NOT in this set.
  const outside = new Uint8Array(w * h);
  const st: number[] = [];
  const push = (p: number) => {
    if (p < 0 || p >= w * h || outside[p] || !alpha[p]) return;
    outside[p] = 1; st.push(p);
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const p = st.pop()!;
    const x = p % w, y = (p / w) | 0;
    if (x + 1 < w) push(p + 1);
    if (x > 0) push(p - 1);
    if (y + 1 < h) push(p + w);
    if (y > 0) push(p - w);
  }
  const t2 = holeTol * holeTol;
  for (let p = 0; p < w * h; p++) {
    if (alpha[p] && !outside[p] && dist2(img, p, bg) < t2) alpha[p] = 0;
  }
}

async function main(): Promise<void> {
  const outDir = join(ROOT, 'public', 'sprites');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const cfg of SPRITES) {
    const input = join(ROOT, 'docs', 'samples', cfg.source);
    if (!existsSync(input)) {
      console.error(`Missing source: ${input}`);
      process.exit(1);
    }
    const img = await load(input);
    const bg = cornerBg(img);
    const alpha = keyFlood(img, bg, cfg.tol);
    const kept = largestBlob(alpha, img.w, img.h);
    // Tighter than the flood tol: enclosed pockets sit well inside the glow
    // ring, so a small tolerance is enough to catch them.
    clearEnclosedBg(img, alpha, bg, Math.max(10, cfg.tol - 6));

    // Bounding box of opaque pixels.
    const { w, h, data } = img;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!alpha[y * w + x]) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) { console.error(`${cfg.type}: keying produced an empty image`); process.exit(1); }
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const buf = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const s = ((y + minY) * w + (x + minX)) * 4;
        const d = (y * cw + x) * 4;
        buf[d] = data[s]!; buf[d + 1] = data[s + 1]!; buf[d + 2] = data[s + 2]!;
        buf[d + 3] = alpha[(y + minY) * w + (x + minX)]!;
      }
    }

    const scale = cfg.targetH / ch;
    const targetW = Math.max(1, Math.round(cw * scale));
    const out = await sharp(buf, { raw: { width: cw, height: ch, channels: 4 } })
      .resize(targetW, cfg.targetH, { fit: 'fill', kernel: 'nearest' })
      .png()
      .toBuffer();
    await sharp(out).toFile(join(outDir, `${cfg.type}.png`));
    console.log(`✓ ${cfg.type}: ${cw}×${ch} → ${targetW}×${cfg.targetH} (kept ${kept} px, bg rgb(${bg.join(',')})`);
  }
  console.log(`\nAll ${SPRITES.length} sprites written to public/sprites/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
