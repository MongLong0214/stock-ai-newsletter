/**
 * 스크래핑 대상 URL 가드 (SSRF 차단)
 *
 * 검색 결과 URL은 외부가 정한다. 리다이렉트나 페이지 안 요청이 내부 주소
 * (클라우드 메타데이터 169.254.169.254, localhost, 사설망)로 향하면 응답이 근거 문서로 들어와
 * 프롬프트·로그로 새어 나간다. 공인 주소로 풀리는 http(s)만 허용한다.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_V4: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 CGNAT
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 링크로컬·메타데이터
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 3], // 224/3 멀티캐스트·예약
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4 매핑(::ffff:a.b.c.d)은 v4 규칙으로 본다
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isBlockedV4(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  // fc00::/7 고유로컬, fe80::/10 링크로컬, ff00::/8 멀티캐스트
  return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower);
}

/** 내부·예약 주소인가 (IP 리터럴만 판정) */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true;
}

/** URL이 공인 주소로만 풀리는 http(s)가 아니면 throw */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`차단된 URL(형식 오류): ${raw.slice(0, 120)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`차단된 URL(프로토콜 ${url.protocol}): ${url.hostname}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error(`차단된 URL(내부 호스트): ${host}`);
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error(`차단된 URL(내부 주소로 풀림): ${host}`);
  }
  return url;
}
