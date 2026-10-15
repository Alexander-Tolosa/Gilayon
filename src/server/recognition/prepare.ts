import sharp from 'sharp'

/*
  Cleans a photographed form before it is read. Phone photos are tilted, dim, and on a ruled form the
  line under each answer touches the letters, which is what trips the OCR up most. Three steps, all local:

    1. straighten: find the tilt that makes the form's text lines most horizontal, and rotate it back
    2. even out the light: stretch the contrast so a dim photo reads like a bright one
    3. take out the ruled lines: long thin horizontal strokes are erased, handwriting and print stay

  Everything runs in this server process (sharp ships its own native code), so it works with no internet.
*/

const WIDTH = Number(process.env.OCR_WIDTH ?? 2400)
const DARK = 150

type Gray = { data: Uint8Array; w: number; h: number }

async function toGray(buf: Buffer, width: number, angle = 0, flip = false): Promise<Gray> {
  let img = sharp(buf, { failOn: 'none' }).rotate() // honours the phone's own orientation tag
  if (flip) img = img.flop()
  if (angle) img = img.rotate(angle, { background: '#ffffff' })
  const { data, info } = await img.grayscale().resize({ width }).raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), w: info.width, h: info.height }
}

/** Brightness at the 1st and 99th percentile: the dark end is the ink, the bright end the paper. */
function range(data: Uint8Array): [number, number] {
  const hist = new Uint32Array(256)
  for (const v of data) hist[v]++
  const total = data.length
  let lo = 0
  let hi = 255
  for (let acc = 0; lo < 255 && acc + hist[lo] < total * 0.01; lo++) acc += hist[lo]
  for (let acc = 0; hi > 0 && acc + hist[hi] < total * 0.01; hi--) acc += hist[hi]
  return [lo, hi]
}

/** Sharpness of the horizontal text lines at one tilt: higher means straighter. */
function straightness(g: Gray, angleDeg: number, ink: number): number {
  const a = (angleDeg * Math.PI) / 180
  const sin = Math.sin(a)
  const cos = Math.cos(a)
  const rows = new Float64Array(g.h * 2)
  const cx = g.w / 2
  const cy = g.h / 2
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (g.data[y * g.w + x] > ink) continue
      const ry = Math.round((x - cx) * sin + (y - cy) * cos + cy)
      if (ry >= 0 && ry < g.h) rows[ry]++
    }
  }
  // Straight text lines pile their ink into a few rows, so the counts vary most: sum of squares.
  let sum = 0
  for (let i = 0; i < g.h; i++) sum += rows[i] * rows[i]
  return sum
}

/** Tilt in degrees (positive = clockwise) that straightens the page, searched over +-5 degrees. */
export async function findTilt(buf: Buffer, opts?: { flip?: boolean }): Promise<number> {
  const g = await toGray(buf, 600, 0, opts?.flip)
  // Ink is whatever is clearly darker than the paper, so a dim photo or a grey desk does not fool the search.
  const [lo, hi] = range(g.data)
  const ink = lo + 0.4 * (hi - lo)
  let best = 0
  let bestScore = -1
  for (let a = -5; a <= 5.001; a += 0.5) {
    const s = straightness(g, a, ink)
    if (s > bestScore) {
      bestScore = s
      best = a
    }
  }
  for (let a = best - 0.5; a <= best + 0.501; a += 0.1) {
    const s = straightness(g, a, ink)
    if (s > bestScore) {
      bestScore = s
      best = a
    }
  }
  return Math.round(best * 10) / 10
}

/** Erases long thin horizontal strokes (the ruled lines under each answer). */
function removeRules(g: Gray) {
  const minRun = Math.round(g.w * 0.05)
  const { data, w, h } = g
  const mark = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    let x = 0
    while (x < w) {
      if (data[y * w + x] > DARK) {
        x++
        continue
      }
      let end = x
      while (end < w && data[y * w + end] <= DARK) end++
      if (end - x >= minRun) for (let i = x; i < end; i++) mark[y * w + i] = 1
      x = end
    }
  }
  // A ruled line is thin. A wide dark band is a heading or a heavy stroke of real writing: leave it.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mark[y * w + x]) continue
      let up = 0
      while (y - up - 1 >= 0 && mark[(y - up - 1) * w + x]) up++
      let down = 0
      while (y + down + 1 < h && mark[(y + down + 1) * w + x]) down++
      if (up + down + 1 <= 7) {
        data[y * w + x] = 255
        // soften the anti-aliased edge of the line as well
        if (y > 0 && data[(y - 1) * w + x] < 235 && !mark[(y - 1) * w + x]) data[(y - 1) * w + x] = Math.max(data[(y - 1) * w + x], 235)
        if (y < h - 1 && data[(y + 1) * w + x] < 235 && !mark[(y + 1) * w + x]) data[(y + 1) * w + x] = Math.max(data[(y + 1) * w + x], 235)
      }
    }
  }
}

/** `flip` mirrors the picture left to right, for a camera whose driver hands over a mirrored view. */
export type PrepareOptions = { rules?: boolean; tilt?: boolean; flip?: boolean }

/** Returns a clean grayscale PNG ready for OCR. Falls back to the original image if anything fails. */
export async function prepareImage(buf: Buffer, opts: PrepareOptions = {}): Promise<Buffer> {
  try {
    const tilt = opts.tilt === false ? 0 : await findTilt(buf, opts)
    const g = await toGray(buf, WIDTH, Math.abs(tilt) >= 0.3 ? tilt : 0, opts.flip)
    // even out the light: stretch the 1st to 99th percentile of brightness to the full range
    const [lo, hi] = range(g.data)
    if (hi - lo > 40) for (let i = 0; i < g.data.length; i++) g.data[i] = Math.max(0, Math.min(255, Math.round(((g.data[i] - lo) * 255) / (hi - lo))))
    if (opts.rules !== false) removeRules(g)
    return await sharp(Buffer.from(g.data), { raw: { width: g.w, height: g.h, channels: 1 } }).png().toBuffer()
  } catch {
    return buf
  }
}
