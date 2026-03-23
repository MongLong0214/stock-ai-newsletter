import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactElement } from 'react';

type OgFontDefinition = {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700;
  style: 'normal';
};

export async function loadOgFonts(): Promise<OgFontDefinition[]> {
  try {
    const [regular, medium, bold] = await Promise.all([
      readFile(
        join(
          process.cwd(),
          'fonts/noto-sans-kr/noto-sans-kr-korean-400-normal.woff'
        )
      ),
      readFile(
        join(
          process.cwd(),
          'fonts/noto-sans-kr/noto-sans-kr-korean-500-normal.woff'
        )
      ),
      readFile(
        join(
          process.cwd(),
          'fonts/noto-sans-kr/noto-sans-kr-korean-700-normal.woff'
        )
      ),
    ]);

    return [
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
    ];
  } catch (error) {
    console.warn(
      '[OG] Failed to load custom fonts. Falling back to default fonts.',
      error
    );
    return [];
  }
}

const ogFontData = loadOgFonts();

export async function createOgImageResponse(
  element: ReactElement,
  size: { width: number; height: number }
): Promise<ImageResponse> {
  const fonts = await ogFontData;

  return new ImageResponse(element, {
    ...size,
    fonts,
  });
}
