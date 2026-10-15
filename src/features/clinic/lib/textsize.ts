/* Text size for clinic screens (A / A+ / A++), remembered per computer. */

export const TEXT_SIZES = [
  { key: 'normal', label: 'A', name: 'Normal text' },
  { key: 'large', label: 'A+', name: 'Large text' },
  { key: 'larger', label: 'A++', name: 'Larger text' },
] as const
export type TextSize = (typeof TEXT_SIZES)[number]['key']
export const TEXT_KEY = 'gilayon-text-size'

/** The text size this computer last chose. A per-PC convenience, so it lives in localStorage. */
export function savedTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_KEY)
    return v === 'large' || v === 'larger' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function applyTextSize(size: TextSize) {
  if (size === 'normal') delete document.documentElement.dataset.text
  else document.documentElement.dataset.text = size
}
