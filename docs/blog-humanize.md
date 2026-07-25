# 블로그 윤문 단계 (AI 문체 제거)

블로그 파이프라인 Phase 2에서 본문 생성 직후 실행되는 후처리 단계.
Gemini가 쓴 한글 본문에서 "AI 티"(번역투·상투구·과도한 완곡·리듬 균일성)만 걷어내고
사실·수치·구조는 그대로 둔다.

[Humanize KR(im-not-ai)](https://github.com/epoko77-ai/im-not-ai)의 monolith Fast Path를
단일 LLM 콜로 이식했다. 라이선스·대응 관계는 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) 참조.

## 파이프라인 위치

```
검색 → 스크래핑 → 경쟁사 분석 → 본문 생성 → [윤문] → 품질 필터 → AI 선별 → 저장·발행
```

`app/blog/pipeline.ts`의 `generateDraft()` 안, `generateBlogContent()` 반환 직후.

품질 점수(`qualityScore`)는 윤문 **전** 본문 기준으로 계산된다.
아래 가드가 점수 구성 요소(헤딩 수·키워드 빈도·분량)를 보존하므로 저장된 점수는 그대로 유효하다.

## 구성

| 파일 | 역할 |
|---|---|
| `app/blog/_prompts/humanize.ts` | A~J 10개 카테고리 룰북, 철칙 8개, 자체검증 7항, 저장소 고유 제약 |
| `app/blog/_services/humanizer.ts` | LLM 호출 + 응답 파싱 + 채택 판정 |
| `app/blog/_utils/change-rate.ts` | 변경률 계산 (과윤문 가드의 SSOT) |
| `app/blog/_config/pipeline-config.ts` | `HUMANIZE_CONFIG` |

## 채택 가드

`evaluateHumanization()`이 결정적으로 판정한다. 하나라도 걸리면 **원문을 그대로 통과**시킨다.

| 가드 | 임계값 | 이유 |
|---|---|---|
| 최소 길이 | 500자 | `validateContent()` 하한 |
| 변경률 | 50% 이상 반려 / 30% 이상 경고 | 과윤문 방지 (원본 철칙 #5) |
| 헤딩 개수 | 불변 | 마크다운 구조 + 가독성 점수 |
| 수치 보존 | 원문의 모든 수치가 남아야 함 | 의미 불변 (원본 철칙 #1) |
| 키워드 빈도 | 3회 아래로 하락 시 반려 | SEO 점수 |
| 분량 | 어절 30% 초과 감소 시 반려 | 길이 점수 |

원문에 없던 `**` 볼드가 생기면 반려 대신 제거한다 (하우스 스타일상 볼드 금지).

분량 가드가 30%인 이유: 결산 lexicon("결론적으로")·형식명사("~하는 것입니다")·이중 완곡
("~할 필요가 있습니다")을 걷어내면 한국어는 자연히 20%대까지 줄어든다. 실측 샘플이 24% 감소였고
초기값 15%에서는 정상 윤문이 전부 반려됐다. 섹션 통째 유실은 헤딩 개수 가드가 먼저 잡으므로,
이 가드는 섹션 내부가 뭉텅이로 잘려나가는 경우만 담당한다.

## 전후 비교 도구

LLM 호출 없이 두 파일을 실제 가드에 태워 문장 단위 diff와 판정을 출력한다.

```bash
npx tsx scripts/humanize-diff.ts before.md after.md "타겟 키워드"
```

변경률은 `1 - 2·LCS/(len_a + len_b)`로 계산한다. 원본은 Python `difflib.SequenceMatcher`를
쓰는데, SequenceMatcher의 매칭량은 LCS 이하이므로 이 값은 원본과 같거나 약간 낮게(보수적으로) 나온다.

## 실패 처리

이 단계는 **절대 실패를 전파하지 않는다.** 빈 응답·타임아웃·API 오류·가드 반려 모두
원문을 반환하고 경고 로그만 남긴다. 윤문은 부가 품질 개선이므로 글 발행을 막아선 안 된다.

파이프라인 레벨에서도 `withTimeoutFallback(..., TIMEOUTS.humanize /* 200s */, generated)`로
한 번 더 감싼다.

## 끄는 법

```bash
BLOG_HUMANIZE=off npm run generate-blog
```

## 로그 읽는 법

```
[Humanize] 채택 (12043ms, 변경률 14.2%)
[Humanize] 채택 (9821ms, 변경률 33.1%): 변경률 경고 33.1%
[Humanize] 반려 (11204ms): 수치 유실 (2024, 30) — 원문 유지
[Humanize] 반려 (8340ms): 과윤문 — 변경률 61.7% — 원문 유지
```

반려가 잦으면 프롬프트의 `<저장소_제약>` 또는 `HUMANIZE_CONFIG` 임계값을 조정한다.
