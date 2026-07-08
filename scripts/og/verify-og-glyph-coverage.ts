#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import ts from 'typescript';

const ROOT_DIR = process.cwd();
const ARTIFACT_DIR = join(ROOT_DIR, '.omo/qa/phase1');
const COVERAGE_JSON = join(ARTIFACT_DIR, 'og-glyph-coverage.json');
const MISSING_CHARS_FILE = join(ARTIFACT_DIR, 'og-glyph-missing-chars.txt');
const PRE_EXISTING_GAPS_FILE = join(ARTIFACT_DIR, 'og-glyph-pre-existing-gaps.txt');
const FONT_PAIRS = [
  {
    weight: 500,
    originalPath: join(ROOT_DIR, 'fonts/noto-sans-kr/noto-sans-kr-korean-500-normal.woff'),
    subsetPath: join(ROOT_DIR, 'fonts/noto-sans-kr/noto-sans-kr-korean-500-normal-subset.woff'),
  },
  {
    weight: 700,
    originalPath: join(ROOT_DIR, 'fonts/noto-sans-kr/noto-sans-kr-korean-700-normal.woff'),
    subsetPath: join(ROOT_DIR, 'fonts/noto-sans-kr/noto-sans-kr-korean-700-normal-subset.woff'),
  },
] as const;

type RangeResult = { readonly data: readonly unknown[] | null; readonly error: { readonly message: string } | null };
type RangeQuery = { range(from: number, to: number): PromiseLike<RangeResult> };
type FontPair = (typeof FONT_PAIRS)[number];
type Coverage = {
  readonly weight: number;
  readonly originalFont: string;
  readonly subsetFont: string;
  readonly requiredMissingChars: readonly string[];
  readonly preExistingGapChars: readonly string[];
  readonly coveredRequiredChars: number;
  readonly totalRequiredChars: number;
};

function addText(chars: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  for (const char of value.normalize('NFC')) {
    if (char !== '\n' && char !== '\r' && char !== '\t') chars.add(char);
  }
}

async function collectOgSourceFiles(): Promise<string[]> {
  const files = new Set<string>([join(ROOT_DIR, 'lib/og-template.tsx')]);

  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name === 'opengraph-image.tsx' || entry.name === 'twitter-image.tsx') {
        files.add(path);
      }
    }
  }

  await visit(join(ROOT_DIR, 'app'));
  return [...files].sort();
}

async function collectStaticLiterals(chars: Set<string>): Promise<string[]> {
  const files = await collectOgSourceFiles();

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function visit(node: ts.Node): void {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
        addText(chars, node.text);
      }
      if (ts.isTemplateExpression(node)) {
        addText(chars, node.head.text);
        for (const span of node.templateSpans) addText(chars, span.literal.text);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return files.map((file) => relative(ROOT_DIR, file));
}

async function fetchAllRows(queryFactory: () => RangeQuery, label: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const result = await queryFactory().range(from, from + pageSize - 1);
    if (result.error) throw new Error(`${label} fetch failed: ${result.error.message}`);
    const pageRows = Array.isArray(result.data) ? result.data : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
}

function addRowFields(chars: Set<string>, row: unknown, fields: readonly string[]): void {
  if (typeof row !== 'object' || row === null) return;
  const record = row as Record<string, unknown>;
  for (const field of fields) addText(chars, record[field]);
}

async function collectSupabaseText(chars: Set<string>): Promise<{ blogPostCount: number; themeCount: number }> {
  if (process.env.OG_GLYPH_SKIP_SUPABASE === '1') return { blogPostCount: 0, themeCount: 0 };

  loadDotenv({ path: join(ROOT_DIR, '.env.local'), quiet: true });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const [blogPosts, themes] = await Promise.all([
    fetchAllRows(() => supabase.from('blog_posts').select('title, description').eq('status', 'published'), 'blog_posts'),
    fetchAllRows(() => supabase.from('themes').select('name, name_en'), 'themes'),
  ]);

  for (const row of blogPosts) addRowFields(chars, row, ['title', 'description']);
  for (const row of themes) addRowFields(chars, row, ['name', 'name_en']);
  return { blogPostCount: blogPosts.length, themeCount: themes.length };
}

function readWoffTable(buffer: Buffer, tag: string): Buffer {
  if (buffer.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Expected WOFF font');

  const tableCount = buffer.readUInt16BE(12);
  for (let index = 0; index < tableCount; index += 1) {
    const entryOffset = 44 + index * 20;
    if (buffer.toString('ascii', entryOffset, entryOffset + 4) !== tag) continue;

    const offset = buffer.readUInt32BE(entryOffset + 4);
    const compressedLength = buffer.readUInt32BE(entryOffset + 8);
    const originalLength = buffer.readUInt32BE(entryOffset + 12);
    const table = buffer.subarray(offset, offset + compressedLength);
    return compressedLength === originalLength ? Buffer.from(table) : inflateSync(table);
  }

  throw new Error(`Missing ${tag} table`);
}

function readFormat4Codepoints(cmap: Buffer, offset: number): Set<number> {
  const codepoints = new Set<number>();
  const segmentCount = cmap.readUInt16BE(offset + 6) / 2;
  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segmentCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segmentCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segmentCount * 2;

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const startCode = cmap.readUInt16BE(startCodeOffset + segment * 2);
    const endCode = cmap.readUInt16BE(endCodeOffset + segment * 2);
    if (startCode === 0xffff && endCode === 0xffff) continue;

    for (let codepoint = startCode; codepoint <= endCode; codepoint += 1) {
      const idDelta = cmap.readInt16BE(idDeltaOffset + segment * 2);
      const idRangeOffset = cmap.readUInt16BE(idRangeOffsetOffset + segment * 2);
      if (idRangeOffset === 0) {
        if (((codepoint + idDelta) & 0xffff) !== 0) codepoints.add(codepoint);
        continue;
      }

      const glyphOffset = idRangeOffsetOffset + segment * 2 + idRangeOffset + (codepoint - startCode) * 2;
      if (cmap.readUInt16BE(glyphOffset) !== 0) codepoints.add(codepoint);
    }
  }

  return codepoints;
}

function readFontCodepoints(fontPath: string): Set<number> {
  const cmap = readWoffTable(readFileSync(fontPath), 'cmap');
  const codepoints = new Set<number>();

  for (let index = 0; index < cmap.readUInt16BE(2); index += 1) {
    const offset = cmap.readUInt32BE(4 + index * 8 + 4);
    if (cmap.readUInt16BE(offset) !== 4) continue;
    for (const codepoint of readFormat4Codepoints(cmap, offset)) codepoints.add(codepoint);
  }

  return codepoints;
}

function checkFontCoverage(fontPair: FontPair, chars: Set<string>): Coverage {
  const originalCodepoints = readFontCodepoints(fontPair.originalPath);
  const subsetCodepoints = readFontCodepoints(fontPair.subsetPath);
  const preExistingGapChars: string[] = [];
  const requiredMissingChars: string[] = [];
  let totalRequiredChars = 0;

  for (const char of chars) {
    const codepoint = char.codePointAt(0);
    if (codepoint === undefined) continue;
    if (!originalCodepoints.has(codepoint)) {
      preExistingGapChars.push(char);
      continue;
    }

    totalRequiredChars += 1;
    if (!subsetCodepoints.has(codepoint)) requiredMissingChars.push(char);
  }

  return {
    weight: fontPair.weight,
    originalFont: relative(ROOT_DIR, fontPair.originalPath),
    subsetFont: relative(ROOT_DIR, fontPair.subsetPath),
    requiredMissingChars,
    preExistingGapChars,
    coveredRequiredChars: totalRequiredChars - requiredMissingChars.length,
    totalRequiredChars,
  };
}

async function writeArtifacts(
  sourceFiles: readonly string[],
  chars: Set<string>,
  coverageByFont: readonly Coverage[],
  counts: { readonly blogPostCount: number; readonly themeCount: number },
  overrideTextUsed: boolean
): Promise<{ requiredMissingChars: string[]; preExistingGapChars: string[] }> {
  const requiredMissingChars = [...new Set(coverageByFont.flatMap((entry) => entry.requiredMissingChars))].sort();
  const preExistingGapChars = [...new Set(coverageByFont.flatMap((entry) => entry.preExistingGapChars))].sort();
  await writeFile(MISSING_CHARS_FILE, requiredMissingChars.join(''), 'utf8');
  await writeFile(PRE_EXISTING_GAPS_FILE, preExistingGapChars.join(''), 'utf8');
  await writeFile(COVERAGE_JSON, `${JSON.stringify({
    checkedAt: new Date().toISOString(),
    ...counts,
    overrideTextUsed,
    supabaseSkipped: process.env.OG_GLYPH_SKIP_SUPABASE === '1',
    staticSourceFiles: sourceFiles,
    totalUniqueChars: chars.size,
    fonts: coverageByFont.map(({ weight, originalFont, subsetFont, coveredRequiredChars, totalRequiredChars, requiredMissingChars, preExistingGapChars }) => ({
      weight,
      originalFont,
      subsetFont,
      coveredRequiredChars,
      totalRequiredChars,
      requiredMissingCount: requiredMissingChars.length,
      preExistingGapCount: preExistingGapChars.length,
    })),
    requiredMissingChars,
    preExistingGapChars,
  }, null, 2)}\n`, 'utf8');
  return { requiredMissingChars, preExistingGapChars };
}

async function main(): Promise<void> {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const chars = new Set<string>();
  const sourceFiles = await collectStaticLiterals(chars);
  const overrideText = process.env.OG_GLYPH_TEXT_OVERRIDE;
  if (overrideText !== undefined) addText(chars, overrideText);

  const counts = await collectSupabaseText(chars);
  const coverageByFont = FONT_PAIRS.map((fontPair) => checkFontCoverage(fontPair, chars));
  const { requiredMissingChars, preExistingGapChars } = await writeArtifacts(
    sourceFiles,
    chars,
    coverageByFont,
    counts,
    overrideText !== undefined
  );

  if (preExistingGapChars.length > 0) {
    console.warn(`[pre-existing gap] ${preExistingGapChars.length} chars are absent from the original WOFFs: ${preExistingGapChars.join(' ')}`);
    console.warn(`Pre-existing gaps written to ${relative(ROOT_DIR, PRE_EXISTING_GAPS_FILE)}`);
  }

  if (requiredMissingChars.length > 0) {
    console.error(`OG glyph coverage failed: ${requiredMissingChars.length} required chars missing from subset fonts`);
    console.error(requiredMissingChars.join(' '));
    console.error(`Missing chars written to ${relative(ROOT_DIR, MISSING_CHARS_FILE)}`);
    process.exit(1);
  }

  console.log(`OG glyph coverage: 100% subset coverage for chars present in original WOFFs (${chars.size} unique chars checked)`);
  console.log(`Supabase rows: blog_posts=${counts.blogPostCount}, themes=${counts.themeCount}`);
  console.log(`Static source files: ${sourceFiles.length}`);
  console.log(`Artifact: ${relative(ROOT_DIR, COVERAGE_JSON)}`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
