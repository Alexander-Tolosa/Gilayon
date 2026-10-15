/* Zoom for clinic screens (the magnifier − / + control in the top bar), remembered per computer. */

/** 100% is the clinic's normal size (already larger than the rest of the app, for senior staff). */
export const ZOOM_MIN = 80
export const ZOOM_MAX = 150
export const ZOOM_STEP = 10
const ZOOM_KEY = 'gilayon-zoom'
/** Window event that keeps every copy of the control showing the same zoom. */
export const ZOOM_EVENT = 'gilayon-zoom-change'
/** The earlier A / A+ / A++ choice, carried over so nobody's chosen size changes under them. */
const OLD_TEXT_KEY = 'gilayon-text-size'
/** The clinic screens' base font size (see `html[data-ui='clinic']` in index.css). */
const BASE_PERCENT = 112.5

const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z / ZOOM_STEP) * ZOOM_STEP))

/** The zoom this computer last chose. A per-PC convenience, so it lives in localStorage. */
export function savedZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    if (v) return clamp(v)
    const old = localStorage.getItem(OLD_TEXT_KEY)
    return old === 'larger' ? 120 : old === 'large' ? 110 : 100
  } catch {
    return 100
  }
}

export function saveZoom(z: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(clamp(z)))
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}

/** Scales every clinic screen by changing the root font size (all sizes are in rem, so layouts reflow). */
export function applyZoom(z: number) {
  const root = document.documentElement.style
  if (clamp(z) === 100) root.removeProperty('font-size')
  else root.fontSize = `${(BASE_PERCENT * clamp(z)) / 100}%`
}

export function clearZoom() {
  document.documentElement.style.removeProperty('font-size')
}

export const stepZoom = (z: number, dir: 1 | -1) => clamp(z + dir * ZOOM_STEP)
