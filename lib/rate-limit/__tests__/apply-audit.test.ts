import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = join(process.cwd(), 'app/api');

const walk = (dir: string, files: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === '__tests__') continue;
      walk(full, files);
    } else if (name === 'route.ts' || name === 'route.tsx') {
      files.push(full);
    }
  }
  return files;
};

const stripCommentsAndStrings = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');

const hasRateLimit = (source: string): boolean => {
  const cleaned = stripCommentsAndStrings(source);
  return /\b(?:checkRateLimit|withRateLimit)\b/.test(cleaned);
};

describe('rate-limit apply audit', () => {
  it('cron routes do not invoke rate-limit utilities (self-block prevention)', () => {
    const cronRoutes = walk(join(API_ROOT, 'cron'));
    for (const file of cronRoutes) {
      const content = readFileSync(file, 'utf8');
      expect({ file, hit: hasRateLimit(content) }).toEqual({ file, hit: false });
    }
  });

  it('admin routes do not invoke rate-limit utilities (self-block prevention)', () => {
    const adminRoutes = walk(join(API_ROOT, 'admin'));
    for (const file of adminRoutes) {
      const content = readFileSync(file, 'utf8');
      expect({ file, hit: hasRateLimit(content) }).toEqual({ file, hit: false });
    }
  });

  it('public API routes (tli, stock, ai, openapi) all invoke rate-limit utilities', () => {
    const publicDirs = ['tli', 'stock', 'ai', 'openapi.json'];
    const missing: string[] = [];
    for (const dir of publicDirs) {
      const fullDir = join(API_ROOT, dir);
      let stat;
      try {
        stat = statSync(fullDir);
      } catch {
        continue;
      }
      const files = stat.isDirectory() ? walk(fullDir) : [fullDir];
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        if (!hasRateLimit(content)) {
          missing.push(file.replace(process.cwd() + '/', ''));
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('cron/admin routes do not use cookies (CSRF invariant)', () => {
    const routes = [
      ...walk(join(API_ROOT, 'cron')),
      ...walk(join(API_ROOT, 'admin')),
    ];
    const violations: string[] = [];
    for (const file of routes) {
      const content = readFileSync(file, 'utf8');
      if (/cookies\s*\(|request\.cookies/.test(content)) {
        violations.push(file.replace(process.cwd() + '/', ''));
      }
    }
    expect(violations).toEqual([]);
  });
});
