import { config as loadEnv } from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

const repoRoot = '/Users/isaac/WebstormProjects/stock-ai-newsletter';
loadEnv({ path: path.join(repoRoot, '.env.local') });

const ogDir = path.join(repoRoot, 'og-images');
await mkdir(ogDir, { recursive: true });

const importModule = async (relativePath) => import(pathToFileURL(path.join(repoRoot, relativePath)).href);

const safeFilePart = (value) =>
  value
    .normalize('NFKC')
    .replace(/[\\/\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

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

async function renderDynamicBlog(slug) {
  const mod = await importModule('app/blog/[slug]/opengraph-image.tsx');
  const response = await mod.default({ params: Promise.resolve({ slug }) });
  await saveImage(`blog-${safeFilePart(slug)}.png`, response);
}

async function renderDynamicTheme(id) {
  const mod = await importModule('app/themes/[id]/opengraph-image.tsx');
  const response = await mod.default({ params: { id } });
  await saveImage(`theme-${safeFilePart(id)}.png`, response);
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

let blogParams = [];
let themeParams = [];

try {
  const blogPage = await importModule('app/blog/[slug]/page.tsx');
  blogParams = await blogPage.generateStaticParams();
  console.log(`blog params: ${blogParams.map((item) => item.slug).join(', ') || '(none)'}`);
} catch (error) {
  console.warn(`blog params failed: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const themePage = await importModule('app/themes/[id]/page.tsx');
  themeParams = await themePage.generateStaticParams();
  console.log(`theme params: ${themeParams.map((item) => item.id).join(', ') || '(none)'}`);
} catch (error) {
  console.warn(`theme params failed: ${error instanceof Error ? error.message : String(error)}`);
}

for (const { slug } of blogParams) {
  console.log(`render blog ${slug}`);
  await renderDynamicBlog(slug);
}

for (const { id } of themeParams) {
  console.log(`render theme ${id}`);
  await renderDynamicTheme(id);
}

const manifest = {
  staticImages: staticImages.map((item) => item.file),
  blogSlugs: blogParams.map((item) => item.slug),
  themeIds: themeParams.map((item) => item.id),
};
await writeFile(path.join(ogDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest.json written');
