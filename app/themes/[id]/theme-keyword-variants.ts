const MEANINGLESS_TAIL_TOKENS = new Set(['등', '개발'])

function cleanFragment(value: string): string {
  const tokens = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)

  while (tokens.length > 0 && MEANINGLESS_TAIL_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop()
  }

  return tokens.join(' ')
}

function splitFragments(value: string): string[] {
  return value
    .split(/[\/·,]/u)
    .map(cleanFragment)
    .filter((fragment) => [...fragment].length > 1)
}

export function themeKeywordVariants(name: string): string[] {
  if (!/[()/]/u.test(name)) return []

  const parentheticalFragments = [...name.matchAll(/\(([^()]*)\)/gu)]
    .flatMap((match) => splitFragments(match[1]))
  const outsideFragments = splitFragments(name.replace(/\([^()]*\)/gu, ' '))
  const head = outsideFragments[0]?.toLocaleLowerCase('en-US')
  const fragments = [...parentheticalFragments, ...outsideFragments.slice(1)]
  const uniqueFragments = new Map<string, string>()

  for (const fragment of fragments) {
    const key = fragment.toLocaleLowerCase('en-US')
    if (key !== head && !uniqueFragments.has(key)) uniqueFragments.set(key, fragment)
  }

  return [...uniqueFragments.values()]
    .flatMap((fragment) => [`${fragment} 관련주`, fragment])
    .slice(0, 6)
}
