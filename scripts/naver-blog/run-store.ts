/**
 * 초안별 고유 run 디렉터리.
 *
 * 공용 `.naver-blog/images`를 쓰면 다음 캡처가 이전 초안의 파일을 덮어쓰고
 * 본문 숫자와 이미지가 어긋난다. 임시 디렉터리에 전부 쓴 뒤 rename으로 원자화한다.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const RUNS_DIR_NAME = 'runs';

export function makeRunId(themeId: string, now = Date.now(), rand = randomBytes(3).toString('hex')): string {
  const utc = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const prefix = themeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'theme';
  return `${utc}-${prefix}-${rand}`;
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256Buffer(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function runDir(baseDir: string, runId: string): string {
  return join(baseDir, RUNS_DIR_NAME, runId);
}

/**
 * 임시 폴더에 파일을 모두 쓴 뒤 최종 경로로 rename한다.
 * 최종 경로가 이미 있으면 덮어쓰지 않는다.
 */
export function writeRunAtomic(
  baseDir: string,
  runId: string,
  files: ReadonlyArray<{ data: Buffer | string; relative: string }>,
): string {
  const finalDir = runDir(baseDir, runId);
  if (existsSync(finalDir)) {
    throw new Error(`run 디렉터리가 이미 있습니다 — 덮어쓰지 않습니다: ${finalDir}`);
  }
  const tmpDir = join(baseDir, RUNS_DIR_NAME, `.tmp-${runId}`);
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });

  try {
    for (const file of files) {
      const target = join(tmpDir, file.relative);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.data);
    }
    mkdirSync(dirname(finalDir), { recursive: true });
    renameSync(tmpDir, finalDir);
  } catch (error) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
  return finalDir;
}

export function assertHashesMatch(
  files: ReadonlyArray<{ path: string; sha256: string }>,
): void {
  const mismatched = files.filter((file) => {
    if (!existsSync(file.path)) return true;
    return sha256File(file.path) !== file.sha256;
  });
  if (mismatched.length) {
    throw new Error(
      `이미지 해시 불일치 — 초안을 재생성하라: ${mismatched.map((f) => f.path).join(', ')}`,
    );
  }
}
