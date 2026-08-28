import { describe, expect, it } from 'vitest';

import { extractJsonArray } from '../keyword-generator';

const ARRAY = '[{"keyword":"삼성전자 주가"}]';

describe('extractJsonArray', () => {
  it('배열 뒤에 설명이 붙어도 배열만 잘라낸다 (CI 실패 재현)', () => {
    expect(extractJsonArray(`${ARRAY}\n\n위 10개 키워드를 제안합니다.`)).toBe(ARRAY);
  });

  it('코드펜스와 앞선 설명을 벗긴다', () => {
    expect(extractJsonArray(`다음은 결과입니다:\n\`\`\`json\n${ARRAY}\n\`\`\``)).toBe(ARRAY);
  });

  it('배열이 없으면 null', () => {
    expect(extractJsonArray('죄송하지만 생성할 수 없습니다.')).toBeNull();
  });
});
