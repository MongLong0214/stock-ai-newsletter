#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ImageResponse } from 'next/og';
import { createOgStaticBackground } from '../../lib/og-template';
import { loadOgFonts } from '../../lib/og-image-response';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
// The URL is cached immutably; bump the filename when the visual changes.
const OUTPUT_PATH = join(process.cwd(), 'public/og-background-v1.png');

async function main(): Promise<void> {
  const response = new ImageResponse(createOgStaticBackground(), {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    fonts: await loadOgFonts(),
  });
  const png = Buffer.from(await response.arrayBuffer());

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, png);

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`PNG bytes: ${png.byteLength}`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
