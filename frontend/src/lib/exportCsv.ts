/**
 * exportCsv — convert an array of {date, value} objects to CSV and trigger download.
 */

export interface CsvRow {
  date: string
  value: number
}

export function exportCsv(rows: CsvRow[], filename: string): void {
  const lines = ['data,valor', ...rows.map((r) => `${r.date},${r.value}`)]
  const csvStr = lines.join('\n')
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
