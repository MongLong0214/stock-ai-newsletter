import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import nextConfig from '@/next.config'
import { createOgLayout } from '@/lib/og-template'

const OG_BACKGROUND_PATH = resolve(process.cwd(), 'public/og-background-v1.png')
const OG_BACKGROUND_SHA256 = 'a7c36c0c4f7a686976142736cbb6a5ae6b51228175f073cc78df5b88cf3069ce'

describe('versioned OG background asset', () => {
  it('ships the pinned 1200x630 PNG instead of a TypeScript data URI', async () => {
    const png = await readFile(OG_BACKGROUND_PATH)

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(createHash('sha256').update(png).digest('hex')).toBe(OG_BACKGROUND_SHA256)

    const markup = renderToStaticMarkup(createOgLayout({
      title: 'OG asset contract',
      subtitle: 'Static background',
    }))
    expect(markup).toContain('/og-background-v1.png')
    expect(markup).not.toContain('data:image/png;base64')
  })

  it('serves the versioned asset with an immutable cache contract', async () => {
    expect(nextConfig.headers).toBeTypeOf('function')
    const rules = await nextConfig.headers!()
    const assetRule = rules.find((rule) => rule.source === '/og-background-v1.png')

    expect(assetRule?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    })
  })
})
