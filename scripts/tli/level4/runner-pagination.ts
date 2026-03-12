export function buildPagedRanges(totalRows: number, pageSize: number) {
  if (totalRows <= 0 || pageSize <= 0) return []

  const ranges: Array<{ from: number; to: number }> = []
  for (let from = 0; from < totalRows; from += pageSize) {
    ranges.push({
      from,
      to: Math.min(totalRows - 1, from + pageSize - 1),
    })
  }
  return ranges
}

export function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    deduped.push(value)
  }

  return deduped
}

export async function loadAllOrderedRows<T>(input: {
  countRows: () => Promise<number>
  pageSize: number
  loadPage: (range: { from: number; to: number }) => Promise<T[]>
}) {
  const totalRows = await input.countRows()
  const ranges = buildPagedRanges(totalRows, input.pageSize)
  const rows: T[] = []

  for (const range of ranges) {
    rows.push(...await input.loadPage(range))
  }

  return rows
}
