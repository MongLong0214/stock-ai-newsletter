import { compareUtf8Bytes } from '@/lib/tli/canonical-json'

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_ID_CHUNK_SIZE = 200

export type SupabaseConfirmatoryQueryResult = {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

export interface SupabaseConfirmatoryQuery extends PromiseLike<SupabaseConfirmatoryQueryResult> {
  select(columns: string): SupabaseConfirmatoryQuery
  eq(column: string, value: string): SupabaseConfirmatoryQuery
  in(column: string, values: readonly string[]): SupabaseConfirmatoryQuery
  order(column: string, options: { readonly ascending: boolean }): SupabaseConfirmatoryQuery
  range(from: number, to: number): SupabaseConfirmatoryQuery
  maybeSingle(): PromiseLike<SupabaseConfirmatoryQueryResult>
}

export interface SupabaseConfirmatoryTable {
  select(columns: string): SupabaseConfirmatoryQuery
}

export interface SupabaseConfirmatoryClient {
  from(table: string): unknown
}

export type SupabaseConfirmatorySourceOptions = {
  readonly pageSize?: number
  readonly idChunkSize?: number
}

export type ConfirmatoryFeatureSourceErrorCode = 'QUERY_FAILED' | 'INVALID_RESPONSE'

export class ConfirmatoryFeatureSourceError extends Error {
  readonly name = 'ConfirmatoryFeatureSourceError'

  constructor(
    readonly code: ConfirmatoryFeatureSourceErrorCode,
    readonly table: string,
    message: string,
  ) {
    super(message)
  }
}

type SafeParser<T> = (value: unknown) => (
  | { readonly success: true; readonly data: T }
  | { readonly success: false }
)

type PageRequest<T> = {
  readonly table: string
  readonly pageSize: number
  readonly createQuery: () => SupabaseConfirmatoryQuery
  readonly parser: SafeParser<readonly T[]>
}

type ChunkedRequest<T> = {
  readonly table: string
  readonly pageSize: number
  readonly parser: SafeParser<readonly T[]>
  readonly ids: readonly string[]
  readonly idChunkSize: number
  readonly createChunkQuery: (ids: readonly string[]) => SupabaseConfirmatoryQuery
}

const isConfirmatoryTable = (value: unknown): value is SupabaseConfirmatoryTable => (
  typeof value === 'object'
  && value !== null
  && 'select' in value
  && typeof value.select === 'function'
)

export const resolveSourceOptions = (
  options: SupabaseConfirmatorySourceOptions,
): { readonly pageSize: number; readonly idChunkSize: number } => {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const idChunkSize = options.idChunkSize ?? DEFAULT_ID_CHUNK_SIZE
  if (!Number.isInteger(pageSize) || pageSize <= 0 || !Number.isInteger(idChunkSize) || idChunkSize <= 0) {
    throw new ConfirmatoryFeatureSourceError(
      'INVALID_RESPONSE',
      'configuration',
      'Confirmatory source page and ID chunk sizes must be positive integers',
    )
  }
  return { pageSize, idChunkSize }
}

export const selectFrom = (
  client: SupabaseConfirmatoryClient,
  table: string,
  columns: string,
): SupabaseConfirmatoryQuery => {
  const queryTable = client.from(table)
  if (!isConfirmatoryTable(queryTable)) {
    throw new ConfirmatoryFeatureSourceError(
      'INVALID_RESPONSE',
      table,
      `Confirmatory source client cannot select from ${table}`,
    )
  }
  return queryTable.select(columns)
}

export const readParsed = async <T>(
  table: string,
  pending: PromiseLike<SupabaseConfirmatoryQueryResult>,
  parser: SafeParser<T>,
): Promise<T> => {
  const result = await pending
  if (result.error !== null) {
    throw new ConfirmatoryFeatureSourceError(
      'QUERY_FAILED',
      table,
      `Confirmatory source query failed for ${table}: ${result.error.message}`,
    )
  }
  const parsed = parser(result.data)
  if (!parsed.success) {
    throw new ConfirmatoryFeatureSourceError(
      'INVALID_RESPONSE',
      table,
      `Confirmatory source returned an invalid response for ${table}`,
    )
  }
  return parsed.data
}

export const readAllPages = async <T>(request: PageRequest<T>): Promise<readonly T[]> => {
  const rows: T[] = []
  const query = request.createQuery()
  for (let from = 0; ; from += request.pageSize) {
    const page = await readParsed(
      request.table,
      query.range(from, from + request.pageSize - 1),
      request.parser,
    )
    rows.push(...page)
    if (page.length < request.pageSize) return rows
  }
}

export const readChunkedPages = async <T>(request: ChunkedRequest<T>): Promise<readonly T[]> => {
  const sortedIds = [...new Set(request.ids)].sort(compareUtf8Bytes)
  const rows: T[] = []
  for (let index = 0; index < sortedIds.length; index += request.idChunkSize) {
    const chunk = sortedIds.slice(index, index + request.idChunkSize)
    const pageRows = await readAllPages({
      table: request.table,
      pageSize: request.pageSize,
      createQuery: () => request.createChunkQuery(chunk),
      parser: request.parser,
    })
    rows.push(...pageRows)
  }
  return rows
}
