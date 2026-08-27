import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertHashesMatch, makeRunId, sha256Buffer, sha256File, writeRunAtomic } from '../run-store';

describe('run 디렉터리', () => {
  it('run ID는 테마 prefix와 난수를 넣어 충돌하지 않는다', () => {
    const a = makeRunId('76d40722-382b-4653-9a7c-49f948f04a67', Date.parse('2026-08-27T04:43:18Z'), 'aaa111');
    const b = makeRunId('76d40722-382b-4653-9a7c-49f948f04a67', Date.parse('2026-08-27T04:43:18Z'), 'bbb222');
    expect(a).toContain('76d40722');
    expect(a).not.toBe(b);
  });

  it('run마다 다른 디렉터리를 만들고 이전 파일을 덮어쓰지 않는다', () => {
    const base = mkdtempSync(join(tmpdir(), 'naver-run-'));
    const first = writeRunAtomic(base, 'run-a', [{ relative: 'images/1-hero.png', data: 'old' }]);
    expect(readFileSync(join(first, 'images/1-hero.png'), 'utf-8')).toBe('old');

    const second = writeRunAtomic(base, 'run-b', [{ relative: 'images/1-hero.png', data: 'new' }]);
    expect(readFileSync(join(first, 'images/1-hero.png'), 'utf-8')).toBe('old');
    expect(readFileSync(join(second, 'images/1-hero.png'), 'utf-8')).toBe('new');

    expect(() => writeRunAtomic(base, 'run-a', [{ relative: 'images/1-hero.png', data: 'overwrite' }])).toThrow(/덮어쓰지/);
  });

  it('manifest SHA-256이 파일과 다르면 실패한다', () => {
    const base = mkdtempSync(join(tmpdir(), 'naver-hash-'));
    const path = join(base, '1-hero.png');
    writeFileSync(path, 'payload');
    const ok = sha256File(path);
    expect(ok).toBe(sha256Buffer('payload'));
    expect(() => assertHashesMatch([{ path, sha256: 'deadbeef' }])).toThrow(/해시 불일치/);
    expect(() => assertHashesMatch([{ path, sha256: ok }])).not.toThrow();
    expect(existsSync(path)).toBe(true);
  });
});
