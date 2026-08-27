import { describe, expect, it } from 'vitest';

import { extractClusterEntities, findClusterCollision, isSameCluster } from '../cluster-guard';

describe('extractClusterEntities', () => {
  it('수식어·연도·수량을 벗기고 실체어만 남긴다', () => {
    expect(extractClusterEntities('토스 관련주 대장주 5종목')).toEqual(new Set(['토스']));
    expect(extractClusterEntities('2026 스테이블코인 수혜주 TOP7')).toEqual(new Set(['스테이블코인']));
  });

  it('전부 수식어면 null (판정 불가)', () => {
    expect(extractClusterEntities('관련주 전망 분석')).toBeNull();
  });
});

describe('isSameCluster — 실제 카니벌 사례 재현', () => {
  it('스테이블코인 클러스터: 21편이 발행됐던 변주들을 전부 잡는다', () => {
    const base = '스테이블코인 관련주';
    expect(isSameCluster('스테이블코인 수혜주 정리', base)).toBe(true);
    expect(isSameCluster('2026 스테이블코인 관련주 전망', base)).toBe(true);
    expect(isSameCluster('스테이블코인 대장주 TOP 5', base)).toBe(true);
  });

  it('토스 클러스터: 수식어가 늘어난 변주(부분집합)를 잡는다', () => {
    expect(isSameCluster('토스 상장 관련주', '토스 관련주')).toBe(true);
    expect(isSameCluster('토스뱅크 관련주', '토스 관련주')).toBe(true); // 접두 매칭
  });

  it('실체어가 서로 다른 관련주는 통과한다', () => {
    expect(isSameCluster('반도체 관련주', '2차전지 관련주')).toBe(false);
  });

  it('관련주류가 아닌 키워드에는 적용하지 않는다 (교육 주제 과차단 방지)', () => {
    // "RSI 활용법" 하나가 RSI 주제 전체를 영구 차단하면 안 된다
    expect(isSameCluster('RSI 다이버전스 실전', 'RSI 활용법')).toBe(false);
    expect(isSameCluster('삼성전자 PER 분석', '네이버 PER 분석')).toBe(false);
  });
});

describe('findClusterCollision', () => {
  it('전 기간 키워드 목록에서 충돌을 찾는다', () => {
    const existing = ['irp 계좌 비교', '스테이블코인 관련주', 'rsi 활용법'];
    expect(findClusterCollision('KRW 스테이블코인 수혜주', existing)).toBe('스테이블코인 관련주');
    expect(findClusterCollision('금리인하 수혜주', existing)).toBeNull();
  });
});
