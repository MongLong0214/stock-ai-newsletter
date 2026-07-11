import { z } from 'zod'

export const PROSPECTIVE_IN_FILTER_CHUNK_SIZE = 150
const PAGE_SIZE = 1_000

interface DbResult {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

export type ProspectiveDbQuery = PromiseLike<DbResult>

export const chunkUniqueIds = (ids: readonly string[]): string[][] => {
  const uniqueIds = [...new Set(ids)]
  const chunks: string[][] = []
  for (let offset = 0; offset < uniqueIds.length; offset += PROSPECTIVE_IN_FILTER_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(offset, offset + PROSPECTIVE_IN_FILTER_CHUNK_SIZE))
  }
  return chunks
}

export async function readRows<Schema extends z.ZodType>(
  label: string,
  query: ProspectiveDbQuery,
  schema: Schema,
): Promise<Array<z.output<Schema>>> {
  const { data, error } = await query
  if (error !== null) throw new Error(`${label} query failed: ${error.message}`)
  return z.array(schema).parse(data ?? [])
}

export async function readAllRows<Schema extends z.ZodType>(
  label: string,
  page: (from: number, to: number) => ProspectiveDbQuery,
  schema: Schema,
): Promise<Array<z.output<Schema>>> {
  const rows: Array<z.output<Schema>> = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const batch = await readRows(label, page(from, from + PAGE_SIZE - 1), schema)
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

export async function readChunkedRows<Schema extends z.ZodType>(
  label: string,
  ids: readonly string[],
  page: (chunk: readonly string[], from: number, to: number) => ProspectiveDbQuery,
  schema: Schema,
  compare?: (left: z.output<Schema>, right: z.output<Schema>) => number,
): Promise<Array<z.output<Schema>>> {
  const rows: Array<z.output<Schema>> = []
  for (const chunk of chunkUniqueIds(ids)) {
    rows.push(...await readAllRows(label, (from, to) => page(chunk, from, to), schema))
  }
  if (compare !== undefined) rows.sort(compare)
  return rows
}
