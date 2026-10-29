type CsvValue = string | number | null | undefined

/** Encode spreadsheet text defensively, including formula-like user supplied values. */
export function encodeCsv(rows: readonly (readonly CsvValue[])[]): string {
  const quote = (value: CsvValue) => {
    const text = value == null ? '' : String(value)
    const safeText = typeof value === 'string' && /^\s*[=+\-@]/.test(text) ? `'${text}` : text
    return `"${safeText.replaceAll('"', '""')}"`
  }

  return `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`
}
