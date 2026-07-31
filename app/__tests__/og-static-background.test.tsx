import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import React from 'react'
import { describe, expect, it } from 'vitest'

import nextConfig from '@/next.config'
import { createOgLayout } from '@/lib/og-template'

const OG_BACKGROUND_PATH = resolve(process.cwd(), 'public/og-background-v1.png')
const OG_BACKGROUND_SHA256 = 'a7c36c0c4f7a686976142736cbb6a5ae6b51228175f073cc78df5b88cf3069ce'

describe('versioned OG background asset', () => {
  it('loads the pinned 1200x630 PNG locally without a deployed-host dependency', async () => {
    const png = await readFile(OG_BACKGROUND_PATH)

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(createHash('sha256').update(png).digest('hex')).toBe(OG_BACKGROUND_SHA256)

    const layout = createOgLayout({
      title: 'OG asset contract',
      subtitle: 'Static background',
    })
    const image = React.Children.toArray(layout.props.children).find(
      (child) => React.isValidElement(child) && child.type === 'img',
    ) as React.ReactElement<{ src: unknown }> | undefined
    const backgroundSource = image?.props.src

    expect(backgroundSource).toBeInstanceOf(ArrayBuffer)
    expect(createHash('sha256').update(Buffer.from(backgroundSource as ArrayBuffer)).digest('hex'))
      .toBe(OG_BACKGROUND_SHA256)
    expect(typeof backgroundSource).not.toBe('string')
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
