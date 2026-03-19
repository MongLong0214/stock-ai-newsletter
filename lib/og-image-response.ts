import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactElement } from 'react';

const ogFontData = Promise.all([
  readFile(
    join(
      process.cwd(),
      'node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff'
    )
  ),
  readFile(
    join(
      process.cwd(),
      'node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-500-normal.woff'
    )
  ),
  readFile(
    join(
      process.cwd(),
      'node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff'
    )
  ),
]);

export async function createOgImageResponse(
  element: ReactElement,
  size: { width: number; height: number }
): Promise<ImageResponse> {
  const [regular, medium, bold] = await ogFontData;

  return new ImageResponse(element, {
    ...size,
    fonts: [
      {
        name: 'Noto Sans KR',
        data: regular,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Noto Sans KR',
        data: medium,
        weight: 500,
        style: 'normal',
      },
      {
        name: 'Noto Sans KR',
        data: bold,
        weight: 700,
        style: 'normal',
      },
    ],
  });
}
