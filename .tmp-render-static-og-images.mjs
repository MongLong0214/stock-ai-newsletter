import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

const repoRoot = '/Users/isaac/WebstormProjects/stock-ai-newsletter';
const ogDir = path.join(repoRoot, 'og-images');
await mkdir(ogDir, { recursive: true });

const importModule = async (relativePath) => import(pathToFileURL(path.join(repoRoot, relativePath)).href);

async function saveImage(fileName, response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(ogDir, fileName), buffer);
  console.log(`${fileName} (${buffer.length} bytes)`);
}

async function renderStatic(relativePath, fileName) {
  const mod = await importModule(relativePath);
  const response = await mod.default();
  await saveImage(fileName, response);
}

const staticImages = [
  { path: 'app/opengraph-image.tsx', file: 'root.png' },
  { path: 'app/archive/opengraph-image.tsx', file: 'archive.png' },
  { path: 'app/faq/opengraph-image.tsx', file: 'faq.png' },
  { path: 'app/about/opengraph-image.tsx', file: 'about.png' },
  { path: 'app/subscribe/opengraph-image.tsx', file: 'subscribe.png' },
  { path: 'app/technical-indicators/opengraph-image.tsx', file: 'technical-indicators.png' },
  { path: 'app/themes/(list)/opengraph-image.tsx', file: 'themes-list.png' },
  { path: 'app/themes/methodology/opengraph-image.tsx', file: 'themes-methodology.png' },
  { path: 'app/developers/opengraph-image.tsx', file: 'developers.png' },
];

for (const image of staticImages) {
  console.log(`render static ${image.file}`);
  await renderStatic(image.path, image.file);
}

await writeFile(
  path.join(ogDir, 'manifest-static.json'),
  JSON.stringify({ staticImages: staticImages.map((item) => item.file) }, null, 2) + '\n'
);
console.log('manifest-static.json written');
