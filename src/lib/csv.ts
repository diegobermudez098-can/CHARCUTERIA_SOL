export type Cell = string | number

/** CSV con BOM (Excel) y protección contra inyección de fórmulas en celdas de texto. */
export function toCSV(rows: Cell[][]): string {
  const esc = (v: Cell): string => {
    let s = String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function downloadCSV(filename: string, rows: Cell[][]): void {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
