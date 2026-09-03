# prepare 파이프라인 전수점검·하드닝 보고서 (2026-09-02)

> 대상: `prepare-newsletter` → `daily-newsletter` → watchdog 발행 체인과 `scripts/stock-picks/*` 종목 선정 로직.
> 증거: GitHub run 33559616526(2026-09-02 06:10 KST) 전문 로그, Supabase 실측 프로브, 코드 정적 분석,
> sol(gpt-5.6-sol) 2트랙 감사 + 최종 적대적 리뷰, 문헌 리서치(sonnet 2건), 실데이터 드라이런·핸들러 E2E·frozen 재평가.
> 브랜치 `feat/prepare-pipeline-enterprise`, 코드 커밋 7개 + 문서 2개 (§4).

## 1. 결론 요약

09-02 발행은 성공했지만 "안전해서"가 아니라 "운이 좋아서" 성공했다. 아래 결함은 전부 실측으로 확정한 것이다.

| # | 결함 | 심각도 | 실측 증거 |
|---|---|---|---|
| F1 | KIS 토큰 발급 충돌이 **매일 결정론적으로 재발** | P0 | 로그 21:12:45~54 `EGW00133` ×10, 실패 심볼 10개 = 순회 순서 첫 10개(KOSPI 지수 포함). 시장평가가 사설 발급기로 먼저 발급(미저장), 저장 토큰은 23h TTL이라 다음 run 직전(20:12Z) 만료 |
| F2 | 장전 유령 캔들 적재 | P0 | 09-02 행 2,424개 전부 `O=H=L=C=전일종가, volume=0` (`endDate=오늘`) |
| F3 | 거래일 인덱스(KOSPI 심볼 단독) 결손 102거래일 | P0 | 2025-01~03, 06~08. 종목은 같은 창에 행 존재(삼성전자 419행 vs 지수 320) |
| F4 | 픽 결정 관측성 0 | P1 | 로그에 `PICKS_SOURCE=code` 한 줄. 후보 수·점수·피처 미기록 |
| F5 | 트리거 단일 슬롯·dispatch 미검증·backup 미배선 | P0 | vercel.json 3 cron, 204만 확인, 워크플로우에 backup_run 입력 없음 |
| F6 | 27분 무음 순차 수집, 실패 심볼 무재시도, 오류를 `[]`로 삼킴 | P1 | 21:12:55→21:39:54 로그 0줄 |
| A1 | 발송 선점(`is_sent=true`) 후 전송 → 선점 직후 사망 시 영구 '발송됨' | P0 | `send-newsletter.ts` |
| A3 | prepare 최종 upsert에 CAS 없음 → 발송된 행 덮어쓰기 가능 | P0 | `prepare-newsletter.ts` |
| A4 | 커버리지 게이트가 신호일 행을 검사하지 않음 | P0 | 7일 창 중 1행이면 success |
| F8 | SerpApi 쿼터 소진 → 매 run 42초 낭비 | P1 | `Event signals 수집 실패: aborted` |
| F10 | Node 20 EOL(2026-03-24), actions v4, CI 부재, `check-market` job 순수 낭비 | P1 | 워크플로우 |
| C1 | **캘린더 오류 3중**: 2026-06-08을 현충일 대체공휴일로 오등재(실거래 2,406종목), 2025-06-03 대선 임시휴장 누락, 2024년 표 부재 | P1 | DB 실측 |
| D1 | **데이터 구멍**: 2026-04-02 종목 행 235개(정상 ~2,640) → 롤링 창(20/60일) 무효화로 04-02~06-26 60일간 전 종목 게이트 통과 0 | P0(연구) | 진단 스크립트 |

## 2. 신뢰성 전/후 실측 (같은 날 09-02, 같은 DB)

| 지표 | 전 — run 33559616526 (06:10 KST) | 후 — Task 1 코드 드라이런 (15:09 KST) |
|---|---|---|
| KIS 토큰 403 (`EGW00133`) | 10회 | 0회 (`tokenWarmup=storage`, 발급 0) |
| 수집 실패 심볼 | 10/2,434 (KOSPI 지수 포함) | 0/2,434 |
| 신호일 정확 커버리지 | 미측정 | 100% (2,433/2,433) |
| 유령 당일 행 적재 | 2,424행 | 0행 (`endDate=마지막 확정 세션`) |
| 수집 소요 | 27.0분, 로그 0줄 | 20.5분, 60초마다 heartbeat |
| 거래일 인덱스 | KOSPI 단독(결손 102일) | KOSPI ∪ 앵커(005930·000660 volume>0), 결손 백필 후 일치 |
| PriceBook 행수 (320일 창) | 1,051,595 (창이 실제 ~420거래일로 늘어남) | 819,118 (실제 320거래일) |
| 시장평가 소요 | 43초 (Serp 42초 abort) | 22초 (`degradedSources` 명시) |
| 총 소요 | 30.2분 | 21.9분 |
| 픽 관측성 | 1줄 | funnel(2433→2433→2416→7→3)·top20·파라미터 해시·스냅샷 JSON·step summary·아티팩트 |
| 픽 | 비투엔·코데즈컴바인·제일약품 | 동일 3종목·동일 종가 (당일 데이터 기준 전략 불변) |

핸들러 레벨 E2E(실 Supabase 읽기, dispatch 부작용 경로 제외): 6개 라우트 모두 미인증 401(fail-closed), 정상 인증 시 당일 상태에 맞는 판정(`already_sent` skip, prepared 워치독 `picksSource=code`, sent 워치독 OK). `send-newsletter --dry-run`: 구독자 317명 pagination, 오늘 콘텐츠 렌더 67,768 bytes, 부작용 0.

## 3. 종목 선정 로직 평가 (목표 2)

### 3.1 현행 전략 v0와 이전 주장
`volumeBreakoutNoGapUp`: 60일 거래량 백분위 ≥90, 60일 종가 고점 돌파(≥0%), RSI14 ≤75, 20일 평균거래대금 ≥5억, 신호일 갭상승 제외, 종가 ≥1,000원. 이전 주장 "OOS precision@3 43.0% (99/230) vs random 24.6%"는 (1) 분모가 라벨 있는 픽만(빈 슬롯 제외), (2) random이 같은 적격군을 쓰지 않음, (3) 6 전략군×그리드 탐색 후 같은 test 구간 재평가(sealed holdout 아님), (4) 현시점 stock_master의 과거 적용, (5) **04-02 데이터 구멍으로 픽 1/3 소실** 상태의 수치였다.

### 3.2 최종 「후」 평가 (캘린더 정정 + KOSPI 100일 백필 + 04-02 전종목 백필, 데이터 계약 ok, 180 test dates·9 fold)

| 전략 | 조건부 precision@3 | **slotPrecision@3** [95% CI, 블록 부트스트랩] | 슬롯 커버리지 | anyHit | twoPlusHit |
|---|---|---|---|---|---|
| production v0 | 44.5% (195/438) | **36.1%** [29.8, 42.4] | 81.1% | 68.3% | 33.3% |
| volumeOnly3 (같은 게이트, 거래량 백분위만) | 41.7% | 41.7% [35.4, 48.0] | 100% | 78.3% | 37.2% |
| policyRandom3 (같은 게이트 풀 무작위) | 26.3% | 26.3% [21.5, 32.2] | 100% | 56.1% | 18.9% |
| random3 (전체 유니버스) | 22.2% | 21.9% [17.8, 25.9] | 100% | 51.7% | 12.2% |
| 실험 A: breakout → relaxedBreakout → volumeOnly | 44.3% | 44.3% [38.7, 49.8] | 100% | 80.0% | 41.1% |
| **실험 B: breakout → volumeOnly** | 46.3% | **46.3%** [41.3, 51.1] | 100% | 82.8% | 44.4% |

페어 일별 차이(슬롯 기준): 실험 B − production = **+10.2%p [+5.4, +15.7]**, 실험 B − volumeOnly = +4.6%p [−1.3, +10.6]. 실험 B의 volumeOnly 티어는 102픽 중 55적중(53.9%).

### 3.3 해석과 결정
1. **현 전략의 우위는 실재한다**: 제품 계약(매일 3픽) 기준 36.1% vs 전체 랜덤 21.9%, 게이트 풀 랜덤 26.3%.
2. **가장 큰 레버는 빈 슬롯(19%)의 결정적 채움**: LLM fallback(실측 31~32%) 대신 같은 게이트 풀의 거래량 상위로 채우면 슬롯 타율 +10%p, 하루 1개 이상 적중 확률 68%→83%. 완화 돌파 티어는 열위.
3. 위 실험 수치는 v0 선택에 쓴 개발 창의 재사용(탐색용)이다. **승격은 사전등록 포워드 섀도우**(예측 당일 스냅샷 저장)로만 한다. 실험 B를 다음 사이클 사전등록 후보로 확정.
4. gs-quant: 포팅 가치 없음(우리 RSI Wilder·백분위 동점 0.5 가중은 표준과 일치, backtests에 purge/embargo 없음). 문헌: Cooper(1999) 거래량 조건부 지속이 규칙 전제를 지지; RSI 게이트 근거 약함(자체 AUC .54); 30% 상한가가 +10% 터치를 기계적으로 만드는 가능성은 변동성 매칭 플라시보로 검증 필요; +5%p 검출 파워는 iid 258일, 클러스터·중첩 반영 시 3~6년 → 포워드 누적 + 사전등록이 유일한 정직한 길.
5. 연구 프로토콜 순서(사전등록): E2 게이트 감사(RSI×가격하한 2×2, 갭 규칙) → E4~E6 피처 증분(logVolumeZ20, atrExpansion60, rangeExpansion20, CLV, distanceToHigh) → 동일가중 rank aggregation V1 → L2 logistic. GBDT 보류.

## 4. 구현 (커밋 순)

| 커밋 | 내용 |
|---|---|
| `1370bde` | **신뢰성 코어**: KIS 단일 토큰 프로바이더(single-flight·5분 마진·응답 만료시각·61s cooldown·warmup), 수집 `endDate=마지막 확정 세션`+유령 가드+KOSPI 선행 3회+재시도 큐+오류 분류+정확일 커버리지+start-time pacing+heartbeat, 거래일 인덱스 KOSPI∪앵커, prepare `--target-date/--force/--dispatch-id`·정확일 게이트(0.97)·CAS 저장·요약 JSON·알림, generate-picks 퍼널/스냅샷, Serp 서킷브레이커 |
| `daeaf18` | **발행 체인 이중화**: Vercel 6슬롯, backup/retry/prepared 라우트, dispatch inputs+PAT D-14 알림, `check-market` 삭제·Node 24·actions v7·입력 6종·step summary·아티팩트·실패 알림, 발송 pagination·대기 polling·확정 재시도·워커풀, 워치독 `sent_at`, CI 워크플로우 |
| `b9a14ac` | **연구 하네스**: slotPrecision@3·anyHit·블록 부트스트랩 CI·pairedDailyDelta, policyRandom3/volumeOnly3 베이스라인, LabelStatus, 데이터 계약 게이트, production-strategy artifact, **캘린더 정정**(06-08 제거·2025-06-03 추가), 인덱스 증거우선+미완결 상한, KOSPI 백필 CLI, send `--dry-run` |
| `d336ee0` | 실데이터 검증 결함 4건: `HOLIDAYS_2024`, 계약 게이트 지수 제외, 지수 OHLC 파싱, dry-run 조회 |
| `501635a` | 계층형 슬롯 채움 탐색 실험(연구 한정) |
| `7df3181` | **sol 최종 리뷰 반영**: 미확정 선점 복구 재발송(중복 가능·누락 방지), dispatch 단일 POST+`display_title` 매칭, 불리언 정규화, prepare 절대 데드라인(38분)·fallback red, 토큰 거부 1회 재발급, crash 오경보 제거, physicalCalls, SendGrid 타임아웃/데드라인, 라우트 회귀 테스트 복원 |
| `c031f9c` | 희소 날짜 데이터 계약 게이트(날짜별 거래량>0 종목 비율 <80% → 실패, `gapDatesTop`), 수집 리포트 `perDateSymbolCounts` + prepare 경고, 커스텀 Error 관례 교정. 첫 실행에서 09-02 유령 행(당일 아침 구 코드가 적재, 익일 수집이 덮어씀)을 정확히 잡아냄 |
| Task 9a | **exactly-once 발송**: `063_newsletter_delivery_ledger.sql`의 20분 sending lease와 수신자별 delivery ledger, retryable 수신자만 재시도 |

데이터 수리(프로덕션 DB, 추가 삽입만): KOSPI 지수 결손 100일 백필(`repair-kospi-index.ts --apply`, remainingMissing 0), 2026-04-02 전 종목 백필(2,422행; 실패 12는 당시 미상장).

## 5. 운영 타임라인 (KST) 과 실패→복구

| 시각 | 인프라 | 동작 | 실패 시 복구 |
|---|---|---|---|
| 06:10 | Vercel cron → dispatch | prepare primary (target_date·dispatch_id, run 생성 검증 `verified`) | 06:50 backup |
| 06:50 | Vercel cron | prepare backup (`--backup-run`: code 픽 있으면 no-op, fallback/무행 재생성) | 07:05 워치독 알림 |
| 07:05 | Vercel 함수 직접 판정 | 콘텐츠 준비 확인 — 무행 500+메일, fallback 메일, crash는 정상 | 수동 dispatch |
| 07:27 | Vercel cron → dispatch | send primary (행 없으면 12분 polling) | 07:45 retry |
| 07:45 | Vercel cron | send retry — 만료·해제된 lease를 다시 잡고 원장의 `pending`·`failed_retryable` 수신자만 재시도 | 08:15 워치독 |
| 08:10 / 08:15 | GitHub cron / Vercel | 발송 확인(`sent_at`·구독자 수 대비) → 메일 | 수동 |

| 실패 | 감지 | 복구 |
|---|---|---|
| primary dispatch 유실/미확인 | `verified:false` 로그 | 06:50 backup (재POST 없음) |
| prepare 코드 픽 실패 → LLM fallback | 워크플로우 red + 메일 + 07:05 메일 | 06:50 backup 재생성 |
| prepare 예산 초과 | `prepare_aborted` + 메일, 행 미기록 | 06:50 backup |
| KIS 토큰 403 / 데이터 호출 거부 | cooldown 재시도 / 무효화+재발급 | 재시도 큐 → 정확일 게이트 |
| 발송 워커 사망 (lease 만료 후) | 만료 lease + delivery ledger | 07:45 retry가 `pending`·`failed_retryable`만 재개 |
| 발송 부분 실패 | `send_incomplete` + 상태별 원장 집계 메일 | lease 해제 후 07:45 retry; `accepted`·`failed_terminal`·`unknown`은 자동 재발송 금지 |
| 확정 update 실패 | throw → red | 07:45 retry 복구 경로 |

`newsletter_deliveries`는 최초 lease 획득 시점의 활성 구독자를 발송 대상으로 고정한다. SendGrid 2xx만 `accepted`, 재시도 소진 429·5xx·네트워크 오류는 `failed_retryable`, 그 밖의 4xx는 `failed_terminal`, 요청 전송 뒤 타임아웃은 중복 위험 때문에 `unknown`으로 기록한다. `pending`과 `failed_retryable`이 없어야만 `newsletter_content.is_sent=true`로 확정한다.

## 6. 검증 방법 (재현 가능)

- 단위: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` — 328 파일 / 3,704 테스트 통과.
- env 주입 전체 스위트(TLI env 의존 41파일 포함): 메인 체크아웃 cwd에서 `vitest run --root <워크트리>` (`tli-boundary-manifest`·prepare 워크플로우 YAML 읽기 테스트 2건은 cwd 상대경로라 메인 트리를 읽어 오탐; 워크트리 cwd에서는 통과).
- 실데이터: `prepare-newsletter.ts --dry-run --force`(21.9분), 라우트 핸들러 E2E(`CRON_SECRET` 프로세스 주입), `send-newsletter.ts --dry-run --target-date=...`, `repair-kospi-index.ts`(dry-run→apply), `optimize.ts --frozen`(전/중간/후 3회).
- 워크트리엔 `.env.local`이 없으므로 실데이터 실행은 `cd <메인> && <워크트리>/node_modules/.bin/tsx --tsconfig <워크트리>/tsconfig.json <스크립트>`.

## 7. Isaac 결정 필요

1. **수신자 단위 delivery ledger + sending lease(스키마)** — exactly-once 발송. 현재는 "미확정 선점 → 전원 재발송(중복 가능)" 잠정 정책.
2. **실험 B(breakout → volumeOnly 채움)의 사전등록 포워드 섀도우** 개시 — `stock_pick_snapshots` 테이블(예측 당일 스냅샷 영속) 승인 필요. 현재는 아티팩트(90일)에만 저장.
3. `market_sessions` SSOT 테이블 vs 현행 앵커 인덱스 유지.
4. KIS 수집 속도 2→5/s 카나리(`STOCK_PICKS_KIS_RATE_LIMIT_PER_SECOND`), 계정 종류(실전/모의) 확인.
5. LLM fallback을 계속 픽 필러로 인정할지(실험 B는 결정적 대안), primary objective(expectedHits vs anyHit), 투자경고·단기과열 하드 배제, 독자당 배정액→ADV 하한.
6. SerpApi 쿼터 복구 여부, `GH_DISPATCH_TOKEN` 만료일(D-14 알림 신설).
7. 캘린더 유지보수: 매년 12월 다음 해 표 갱신 + 임시공휴일 즉시 반영(라우트·인덱스·연구 게이트가 전부 의존).
