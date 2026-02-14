/**
 * CTF Key Hunter 연동 — 키 갱신, 로드, 선택
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { WORKING_KEYS_FILE, KEYS_MAX_AGE_MS } from '../constants';
import type { WorkingKeys } from '../types';

const HUNTER_SCRIPT = resolve(__dirname, 'ctf-key-hunter.js');
const HUNTER_TIMEOUT_MS = 5 * 60 * 1000; // 5분

// --- 24시간 이내 유효한 키 파일 존재 여부 ---
export function isKeysFresh(): boolean {
  if (!existsSync(WORKING_KEYS_FILE)) return false;
  const stat = statSync(WORKING_KEYS_FILE);
  return Date.now() - stat.mtimeMs < KEYS_MAX_AGE_MS;
}

// --- CTF Key Hunter 실행으로 키 갱신 ---
export function refreshWorkingKeys(): boolean {
  console.log('[KeyRefresh] CTF Key Hunter 실행...\n');
  try {
    execSync(`node "${HUNTER_SCRIPT}" --working --pages=10 --limit=50`, {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: HUNTER_TIMEOUT_MS,
    });
    return true;
  } catch {
    if (existsSync(WORKING_KEYS_FILE)) {
      console.warn('[KeyRefresh] Hunter 실패, 기존 파일 사용');
    } else {
      console.error(
        `[KeyRefresh] Hunter 실패 & 기존 파일 없음. "node ${HUNTER_SCRIPT} --login" 실행 필요`,
      );
    }
    return false;
  }
}

// --- Working Keys JSON 로드 ---
export function loadWorkingKeys(): WorkingKeys {
  if (!existsSync(WORKING_KEYS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(WORKING_KEYS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}
