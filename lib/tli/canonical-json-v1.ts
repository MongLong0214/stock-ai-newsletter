import { createHash } from 'node:crypto'

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue }

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError('canonical-json-v1 rejects invalid Unicode surrogate pairs')
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError('canonical-json-v1 rejects invalid Unicode surrogate pairs')
    }
  }
}

function stringifyPrimitive(value: null | boolean | number | string): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('canonical-json-v1 numbers must be finite IEEE 754 values')
  }
  if (typeof value === 'string') assertValidUnicode(value)

  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('canonical-json-v1 encountered an unsupported primitive')
  }
  return serialized
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return stringifyPrimitive(value)
  }

  if (typeof value !== 'object') {
    throw new TypeError(`canonical-json-v1 encountered an unsupported ${typeof value} value`)
  }
  if (ancestors.has(value)) {
    throw new TypeError('canonical-json-v1 rejects cyclic values')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const items: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError('canonical-json-v1 rejects sparse arrays')
        }
        items.push(serialize(value[index], ancestors))
      }
      return `[${items.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonical-json-v1 accepts only plain JSON objects')
    }

    const keys = Object.keys(value)
    if (Reflect.ownKeys(value).length !== keys.length) {
      throw new TypeError('canonical-json-v1 rejects symbol and non-enumerable properties')
    }

    keys.sort()
    return `{${keys.map((key) => {
      assertValidUnicode(key)
      return `${stringifyPrimitive(key)}:${serialize(Reflect.get(value, key), ancestors)}`
    }).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalJsonV1(value: unknown): string {
  return serialize(value, new Set<object>())
}

export function canonicalJsonV1Bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJsonV1(value))
}

export function canonicalJsonV1Sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJsonV1Bytes(value)).digest('hex')
}

export function parseCanonicalJsonV1(canonicalJson: string): CanonicalJsonValue {
  let value: unknown
  try {
    value = JSON.parse(canonicalJson) as unknown
  } catch (error) {
    throw new TypeError('canonical-json-v1 input is not valid JSON', { cause: error })
  }

  if (canonicalJsonV1(value) !== canonicalJson) {
    throw new TypeError('canonical-json-v1 input is not the unique RFC 8785 representation')
  }
  return value as CanonicalJsonValue
}
