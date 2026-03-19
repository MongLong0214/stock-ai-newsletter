import { config as loadEnv } from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'url';

const repoRoot = '/Users/isaac/WebstormProjects/stock-ai-newsletter';
loadEnv({ path: path.join(repoRoot, '.env.local') });

const importModule = async (relativePath) => import(pathToFileURL(path.join(repoRoot, relativePath)).href);

try {
  const blogPage = await importModule('app/blog/[slug]/page.tsx');
  const blogParams = await blogPage.generateStaticParams();
  console.log('BLOG', JSON.stringify(blogParams));
} catch (error) {
  console.error('BLOG_ERROR', error instanceof Error ? error.message : String(error));
}

try {
  const themePage = await importModule('app/themes/[id]/page.tsx');
  const themeParams = await themePage.generateStaticParams();
  console.log('THEME', JSON.stringify(themeParams));
} catch (error) {
  console.error('THEME_ERROR', error instanceof Error ? error.message : String(error));
}
