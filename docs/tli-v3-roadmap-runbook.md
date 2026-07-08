# TLI v3 로드맵 런북 — 팔로우업·진행 절차 (2026-07-08 기준)

Status: 운영 문서 (살아있는 문서 — 각 이벤트 발생 시 §7 실행 로그에 추가)
비전·킬크리테리아: `docs/tli-v3-product-vision.md` / 판정 기준: `docs/tli-v3-early-promotion-preregistration.md`

## 1. 지금 어디에 있나 (as of 2026-07-08)

- champion `b-abl-v1` 서빙 중 (확률 노출 OFF), challenger `m1-2026w28` shadow 기록 중 (7/7부터 유효)
- **m1.1** (13피처, analog 계열 주입) codex 구현 중 → 완료 시 `m1-2026w28-a1`로 재등록 예정
- 앵커 데이터 7/7부터 축적 개시 / 에피소드 peak 보존 수정 적용
- 워치리스트 리포트(플라이휠 MVP) codex 구현 중
- 다중윈도우 3창 판정: 1/3 통과 (조기 승격 보류 상태)

## 2. 운영 캘린더 (날짜별 팔로우업)

### 매일 (자동 + 1분 확인)
| 확인 | 방법 | 이상 시 |
|---|---|---|
| collect-data 크론 성공 여부 | `gh run list --workflow=tli-collect-data.yml --limit 2` | 누락/취소 → 수동 dispatch (`gh workflow run tli-collect-data.yml -f mode=full`) — **7/7에 크론 무단 누락 전례 있음** |
| shadow 건강 | `npm run tli:watchlist` (구현 완료 후) — 커버리지·abstain·ECE 궤적이 리포트 하단에 표시 | 커버리지 급락 → 피처 로더/배치 조사 |
| 워치리스트 활용 | 리포트 상위 테마를 콘텐츠 우선순위에 반영 (3층 플라이휠) | — |

### 단기 이벤트 (날짜 박제)
| 시점 | 이벤트 | 행동 주체 |
|---|---|---|
| **D+1~2 (7/9~10)** | m1.1 구현 완료 → 재학습 → `m1-2026w28-a1` 등록 → **3창 리플레이 재판정** | CTO (아래 §3 분기) |
| **~7/16** | 앵커 7영업일 축적 → `interest_level_pct` 계산 가능 → 재학습 시 피처 부활 | 자동 (주간 재학습에 반영) |
| **~7/21** | T-106 앵커 후보 14일 CV 자동 판정 (`npm run tli:anchor:stability`) | CTO 확인 |
| **매주 토 21:00 UTC** | weekly-learn 크론 (체크포인트 아닌 주는 자동 skip — 정상) | 자동 |
| **~8/4 (4주차)** | 표준 gate 첫 체크포인트: n_eff≥250 확인 → gate 평가 | 자동 + CTO 판독 |
| 승격 발생 시 **D+14** | 확인 체크포인트 (사전등록 §6): 미달 시 자동 롤백 | CTO |

## 3. m1.1 3창 재판정 의사결정 트리 (핵심 분기)

```
m1.1 재학습 → 3창 리플레이 (A: 5/11-5/22, B: 5/25-6/5, C: 6/8-6/26)
├─ 3창 전부 C1~C4 통과 (C5 충족)
│   → 사전등록 조기 경로 재개. Isaac에게 승격+노출 승인 요청
│     (반복 look 2회째임을 명시). 승인 시: promote RPC + 노출 플래그 + 트립와이어 + D+14
├─ 2/3 통과 (특히 B창 IC가 양수로 회복됐다면)
│   → analog 피처가 작동한다는 신호. 표준 게이트 경로 유지하되
│     앵커 부활(7/16) 후 재학습본으로 주 1회 3창 재판정 반복
├─ 1/3 이하 (B창 IC 여전히 붕괴)
│   → "analog 신호 GT-A 전이 실패" 기록. 남은 레버 = 피처 부활 대기뿐.
│     킬 크리테리아 관측 개시 (§5) — 4주 관측 후에도 IC 불안정하면 동결 논의
└─ 어떤 경우든: 기준(C1~C5) 변경 금지. 결과는 사전등록 §7에 박제.
```

재판정 실행 명령 (CTO 세션):
```bash
# 재학습+등록 (m1.1)
npx tsx --env-file=.env.local scripts/tli/learn/run-weekly-learn.ts --step=train-new-challenger \
  --training-dataset=<scratch>/m1_1-train.json --artifact-output=<scratch>/m1_1-artifact.json \
  --trained-at=<오늘> --model-version=m1-2026w28-a1
# 3창 (각각, work-dir/출력 분리)
npx tsx --env-file=.env.local scripts/tli/learn/run-replay-audit.ts --train-end=2026-05-01 \
  --replay-start=2026-05-11 --replay-end=2026-05-22 --work-dir=.omo/replay-wA --force-retrain=1 \
  --json-output=docs/evidence/tli-v3-replay-wA-m11.json --markdown-output=docs/evidence/tli-v3-replay-wA-m11.md
# (B: 5/15/5/25-6/5, C: 5/29/6/8-6/26 동일 패턴)
```

## 4. 역할 분담

| 주체 | 담당 |
|---|---|
| **자동 (크론)** | 일일 수집·shadow 기록·라벨링, 주간 learn, 앵커/reflexivity 리포트 |
| **CTO (에이전트 세션)** | 재학습·재판정 실행, 리포트 판독, 결함 수정 스펙·리뷰 (구현은 codex), 문서 박제 |
| **Isaac 결정 필요** | ① 승격+노출 승인 (조기 경로 재개 시) ② UI 신설 (2층 제품화, 대원칙 #3) ③ 게이트 구조 정정(Track 3) 여부 ④ 킬/동결 결정 |

## 5. 리스크 워치리스트 (감시 항목)

1. **크론 무단 누락** — 7/7 실증. 워치리스트 리포트가 일일 카나리아 (빈 출력 = 경보)
2. **eceUpper95 ≤ 0.12 @ n≈250** — 4주 정각 gate의 얇은 마진 (실측: in-sample n=250 p97.5=0.1196). 미달 시 gate가 자동 연장 (8주까지) — 정상 경로이니 당황 금지
3. **반사성(R9)** — 노출 시작 후 reflexivity report 주시 (이제 permutation test로 유의성 판정)
4. **앵커 피처 부활의 양날** — interest_level_pct가 살아나면 missing-flag 분포가 바뀌어 기존 아티팩트의 margin이 이동 → **부활 후 반드시 재학습본으로 평가** (구 아티팩트로 라이브 평가 금지)
5. **테마 키워드 변경** — 라벨 단절 이벤트 (keyword_epoch). 변경 시 PRD 위생 규칙 준수

## 6. 중기 로드맵 (승격 이후)

1. **2층 제품화**: 조기 경보 UI (워치리스트의 사용자 버전) — Isaac UI 승인 필요, 스펙은 워치리스트 리포트 구조 재사용
2. **T-401~404**: 레거시 정리 (승격 확정 + D+14 통과 후에만 — 롤백 경로 보존 때문)
3. **GT-B 리서치**: 관심→바스켓 수익 전이 검증 (판매 금지, 리서치 전용)
4. **theme_stocks 멤버십 이력 테이블**: 바스켓 잔존 survivorship 해소 (스키마 작업)
5. **신규 피처 후보**: 곡선 유사도(3-Pillar 이식), 레짐 조건부 피처 (B창 유형 붕괴 대응)

## 7. 실행 로그 (이벤트 발생 시 추가)

- 2026-07-08: 런북 작성. m1.1·워치리스트 codex 진행 중. challenger `m1-2026w28`(클린 재학습본) shadow 축적 중.
- 2026-07-08 (오후): m1.1(13피처, IC 취약성 해결) → m1.2(prior correction) 연속 반복. look #3 최종 판정 = A·B PASS / C FAIL(ECE 0.0984) → **조기 승격 경로 영구 종결, 표준 gate 전용**. challenger = `m1-2026w28-a2` (7/9부터 shadow 기록). 워치리스트 리포트 첫 실전 생성 (`npm run tli:watchlist`). codex 백그라운드 stall 사고 → `< /dev/null` 규칙 확립 (메모리 박제).
