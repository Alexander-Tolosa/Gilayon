/** Parses CSV text (RFC 4180): quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, BOM. */
export function parseCsv(input: string, delimiter: ',' | ';' | '\t' = ','): string[][] {
  const text = input.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  // Blank lines (all cells empty) carry no data.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Semicolon-separated exports (a common Excel setting) are detected from the header line. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const head = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => head.split(ch).length - 1
  const best = [',', ';', '\t'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? (best[0] as ',' | ';' | '\t') : ','
}
