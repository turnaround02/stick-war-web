/**
 * Sprite-SHEET pipeline (M15 step-2): converts the walk/attack sheets in
 * docs/samples/sheets/ into horizontal-strip PNGs in public/sprites-sheets/
 * for runtime animation.
 *
 * Per sheet:
 *   1. Load the 1024² source (solid dark background, N frames in a row).
 *   2. Sample the bg colour from the four corners.
 *   3. Flood-fill from the borders (tol=16, same as make-sprites.ts) →
 *      background transparent, rim-light halo preserved.
 *   4. Find connected components; keep ONE per frame by scanning a vertical
 *      band per frame slot. Frames are located by x-projection of opaque
 *      pixels: runs of non-empty columns separated by empty gaps are frames.
 *      Within each frame band, keep that band's LARGEST component (the global
 *      largest would keep only frame 0 — the single-frame pipeline's rule does
 *      not apply to sheets).
 *   5. Trim each frame to a COMMON box: the union of the frames' alpha bboxes,
 *      vertically aligned by their common ground line (the sheets generate
 *      with ≤2px drift; a shared box keeps all frames the same size so the
 *      runtime strip is a uniform grid).
 *   6. Nearest-neighbour downscale to targetH (48 regular / 72 giant), lay
 *      frames left-to-right in one strip, write public/sprites-sheets/<type>-
 *      <anim>.png.
 *
 * The strip is loaded by Phaser as a spritesheet with uniform frame width =
 * stripWidth / frameCount. One-shot build step; no sim involvement.
 */

import sharp from 'sharp';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'docs', 'samples', 'sheets');
const OUT_DIR = join(ROOT, 'public', 'sprites-sheets');

const FLOOD_TOL = 16;

interface Img { w: number; h: number; data: Uint8ClampedArray }

async function load(p: string): Promise<Img> {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width!, h: info.height!, data: new Uint8ClampedArray(data) };
}

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
    const i = p * 4;
    const dr = img.data[i]! - bg[0], dg = img.data[i + 1]! - bg[1], db = img.data[i + 2]! - bg[2];
    if (dr * dr + dg * dg + db * db > t2) continue;
    alpha[p] = 0;
    const x = p % w, y = (p / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return alpha;
}

/** Largest connected opaque component restricted to a column band [x0..x1]. */
function largestBlobInBand(
  alpha: Uint8Array,
  w: number,
  h: number,
  x0: number,
  x1: number,
): { cells: number[] } | null {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = y * w + x;
      if (!alpha[p] || seen[p]) continue;
      const cells: number[] = [p];
      const st = [p];
      seen[p] = 1;
      while (st.length) {
        const q = st.pop()!;
        cells.push(q);
        const qx = q % w, qy = (q / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < x0 || nx > x1 || ny < 0 || ny >= h) continue;
          const n = ny * w + nx;
          if (alpha[n] && !seen[n]) { seen[n] = 1; st.push(n); }
        }
      }
      if (cells.length > best.length) best = cells;
    }
  }
  return best.length > 0 ? { cells: best } : null;
}

/**
 * Frame bands from the x-projection HISTOGRAM, not from contiguous runs.
 *
 * Two failure modes killed two simpler rules:
 *
 *   - "Runs of non-empty columns": the spearman walk sheet draws a continuous
 *     ground strip under the feet, so every column is non-empty → one band.
 *   - "Histogram above a fixed threshold": the swordsman ATTACK sheet's raised
 *     sword reaches ~60px into the next frame's gap carrying 60-90 px/column —
 *     any threshold that separates walk bodies (≥100) also splits the attack
 *     frames (their own edge columns dip below 100).
 *
 * What makes the problem tractable: the frame COUNT is known (expectedFrames
 * is a hard contract — a dropped frame is a visibly wrong cycle). So: smooth
 * the histogram, find the N densest local maxima (peaks are ≥ minPeak apart
 * so a single wide body cannot yield two peaks), then cut at the minimum of
 * the smoothed histogram between each adjacent peak pair. A valley floor may
 * be high (spear-under-feet bridges at ~20px/column) — the cut is still the
 * BEST separator because the bridge is thinner than either body.
 */
function frameBands(
  alpha: Uint8Array,
  w: number,
  h: number,
  expectedFrames: number,
): Array<{ x0: number; x1: number }> {
  const raw = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x]) raw[x]++;
    }
  }
  // Smooth with a 15px window: kills single-column prop threads while keeping
  // body bumps (≥60px wide) intact.
  const R = 7;
  const smooth = new Array<number>(w).fill(0);
  for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let d = -R; d <= R; d++) {
      const xx = x + d;
      if (xx < 0 || xx >= w) continue;
      sum += raw[xx]!; n++;
    }
    smooth[x] = sum / n;
  }

  // Peaks: local maxima with the highest smoothed density, ≥ minPeak apart.
  const minPeak = Math.floor(w / (expectedFrames * 2));
  const candidates: Array<{ x: number; v: number }> = [];
  for (let x = 0; x < w; x++) {
    if (smooth[x]! <= 0) continue;
    let isMax = true;
    for (let d = -1; d <= 1; d++) {
      const xx = x + d;
      if (xx >= 0 && xx < w && smooth[xx]! > smooth[x]!) { isMax = false; break; }
    }
    if (isMax) candidates.push({ x, v: smooth[x]! });
  }
  candidates.sort((a, b) => b.v - a.v);
  const peaks: number[] = [];
  for (const c of candidates) {
    if (peaks.every((p) => Math.abs(p - c.x) >= minPeak)) peaks.push(c.x);
    if (peaks.length === expectedFrames) break;
  }
  if (peaks.length !== expectedFrames) return [];
  peaks.sort((a, b) => a - b);

  // Cut at the smoothed-histogram minimum between adjacent peaks.
  const bands: Array<{ x0: number; x1: number }> = [];
  let left = 0;
  for (let i = 0; i < peaks.length; i++) {
    let cut = w;
    if (i < peaks.length - 1) {
      let bestX = peaks[i]! + 1, bestV = Infinity;
      for (let x = peaks[i]! + 1; x < peaks[i + 1]!; x++) {
        if (smooth[x]! < bestV) { bestV = smooth[x]!; bestX = x; }
      }
      cut = bestX;
    }
    bands.push({ x0: left, x1: cut - 1 });
    left = cut;
  }
  return bands;
}

interface FrameOut { cw: number; ch: number; rgba: Buffer }

/** Extract one frame as an RGBA buffer cropped to the given common box. */
function cropFrame(
  img: Img,
  alpha: Uint8Array,
  cells: Set<number>,
  box: { x0: number; y0: number; w: number; h: number },
): FrameOut {
  const { w, data } = img;
  const buf = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const sx = box.x0 + x, sy = box.y0 + y;
      const p = sy * w + sx;
      const d = (y * box.w + x) * 4;
      if (cells.has(p)) {
        const s = p * 4;
        buf[d] = data[s]!; buf[d + 1] = data[s + 1]!; buf[d + 2] = data[s + 2]!; buf[d + 3] = 255;
      }
    }
  }
  return { cw: box.w, ch: box.h, rgba: buf };
}

interface SheetJob {
  /** Output file stem: <type>-<anim>. */
  stem: string;
  source: string;
  targetH: number;
  /** Expected frame count; mismatch is a hard error (a dropped frame means a
   *  visibly wrong cycle — fail loudly instead of shipping a 5-frame walk). */
  expectedFrames: number;
}

/**
 * 11 sheets: walk for all 6 types (miner doubles as gather), attack for the
 * 5 combat types. Uniform targetH per type — same as the single-frame ids.
 */
const JOBS: readonly SheetJob[] = [
  { stem: 'miner-walk',     source: 'miner-walk.png',        targetH: 48, expectedFrames: 6 },
  { stem: 'swordsman-walk', source: 'swordsman-walk.png',    targetH: 48, expectedFrames: 6 },
  { stem: 'swordsman-attack', source: 'swordsman-attack.png', targetH: 48, expectedFrames: 6 },
  { stem: 'archer-walk',    source: 'archer-walk.png',       targetH: 48, expectedFrames: 6 },
  { stem: 'archer-attack',  source: 'archer-attack.png',     targetH: 48, expectedFrames: 6 },
  { stem: 'spearman-walk',  source: 'spearman-walk.png',     targetH: 48, expectedFrames: 6 },
  { stem: 'spearman-attack', source: 'spearman-attack.png',  targetH: 48, expectedFrames: 6 },
  { stem: 'giant-walk',     source: 'giant-walk.png',        targetH: 72, expectedFrames: 6 },
  { stem: 'giant-attack',   source: 'giant-attack.png',      targetH: 72, expectedFrames: 6 },
  { stem: 'mage-walk',      source: 'mage-walk.png',         targetH: 48, expectedFrames: 6 },
  { stem: 'mage-attack',    source: 'mage-attack.png',       targetH: 48, expectedFrames: 6 },
];

async function processJob(job: SheetJob): Promise<void> {
  const input = join(SRC_DIR, job.source);
  if (!existsSync(input)) {
    console.error(`Missing source: ${input}`);
    process.exit(1);
  }
  const img = await load(input);
  const bg = cornerBg(img);
  const alpha = keyFlood(img, bg, FLOOD_TOL);

  // Frame count is the contract: valley-cut between expectedFrames peaks.
  const bands = frameBands(alpha, img.w, img.h, job.expectedFrames);
  if (bands.length !== job.expectedFrames) {
    console.error(
      `${job.stem}: expected ${job.expectedFrames} frames, found ${bands.length}` +
      (bands.length ? ` at x=${bands.map((b) => `${b.x0}-${b.x1}`).join(', ')}` : ''),
    );
    process.exit(1);
  }

  // Per band: largest component + its bbox.
  const frames: Array<{ cells: Set<number>; x0: number; x1: number; y0: number; y1: number }> = [];
  for (const band of bands) {
    const kept = largestBlobInBand(alpha, img.w, img.h, band.x0, band.x1);
    if (!kept) { console.error(`${job.stem}: empty band ${band.x0}-${band.x1}`); process.exit(1); }
    let fx0 = img.w, fx1 = 0, fy0 = img.h, fy1 = 0;
    for (const p of kept.cells) {
      const x = p % img.w, y = (p / img.w) | 0;
      if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
    }
    frames.push({ cells: new Set(kept.cells), x0: fx0, x1: fx1, y0: fy0, y1: fy1 });
  }

  // COMMON box: same height/width for every frame so the strip is a uniform
  // grid. Width = widest frame, height = tallest frame; vertically anchored at
  // the common ground (max y1) so feet land on one line. Horizontally centred
  // per frame within the common width.
  const commonW = Math.max(...frames.map((f) => f.x1 - f.x0 + 1));
  const groundY = Math.max(...frames.map((f) => f.y1));
  const topY = Math.min(...frames.map((f) => f.y0));
  const commonH = groundY - topY + 1;

  const strips: Buffer[] = [];
  for (const f of frames) {
    const cx0 = f.x0 - Math.floor((commonW - (f.x1 - f.x0 + 1)) / 2);
    const cy0 = groundY - commonH + 1;
    const frame = cropFrame(img, alpha, f.cells, { x0: cx0, y0: cy0, w: commonW, h: commonH });
    strips.push(frame.rgba);
  }

  const scale = job.targetH / commonH;
  const frameW = Math.max(1, Math.round(commonW * scale));
  const stripW = frameW * frames.length;
  const composite = Buffer.concat(strips);

  const out = await sharp(composite, { raw: { width: commonW * frames.length, height: commonH, channels: 4 } })
    .resize(stripW, job.targetH, { fit: 'fill', kernel: 'nearest' })
    .png()
    .toBuffer();
  await sharp(out).toFile(join(OUT_DIR, `${job.stem}.png`));
  console.log(
    `✓ ${job.stem}: ${frames.length} frames, common ${commonW}×${commonH} → ${frameW}×${job.targetH} per frame (strip ${stripW}×${job.targetH}, bg rgb(${bg.join(',')}))`,
  );
}

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const available = new Set(readdirSync(SRC_DIR));
  const jobs = JOBS.filter((j) => available.has(j.source));
  const missing = JOBS.filter((j) => !available.has(j.source)).map((j) => j.source);
  if (missing.length) {
    console.log(`skipping ${missing.length} sheet(s) not yet generated: ${missing.join(', ')}`);
  }
  for (const job of jobs) await processJob(job);
  console.log(`\n${jobs.length} sheet(s) written to public/sprites-sheets/ (basename list: ${jobs.map((j) => basename(j.stem)).join(', ')})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
