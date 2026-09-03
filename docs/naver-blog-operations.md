# 네이버 블로그 자동 발행 — 운영 상태와 재개 절차

> **현재 상태: 전면 중단 (2026-09-03~).** 계정 보호조치가 하루에 2회 발생했다.
> 재개는 Isaac의 명시적 승인이 있어야 한다. 정책 재설계안은
> [`naver-blog-publishing-policy-redesign.md`](./naver-blog-publishing-policy-redesign.md).

## 1. 중단 상태 (되살리지 말 것)

| 실행 경로 | 상태 | 확인 방법 |
|---|---|---|
| GitHub Actions `naver-blog.yml` | **disabled_manually** | `gh workflow list --all \| grep -i naver` |
| launchd 일일 작업 | **미등록(bootout 완료)** | `launchctl list \| grep stockmatrix` → 출력 없음 |
| 로컬 수동 실행 | 금지 (`--dry-run`도 금지) | — |

### launchd 상태 정정 (2026-09-03 실측)

인수 문서는 launchd 작업이 "plist는 생성됐으나 **미등록**"이라고 기록했지만, **실제로는 등록되어
있었다.**

```
$ launchctl list | grep stockmatrix
-	0	com.stockmatrix.naver-blog        # 목록에 있음 = 로드됨

$ launchctl print gui/501/com.stockmatrix.naver-blog
	state = not running
		"Hour" => 10 , "Minute" => 0        # 매일 10:00 예약 활성
```

그대로 두면 **다음날 10:00에 세션 접촉 → 초안 생성 → 발행**이 실행됐다. 냉각 기간 중
가장 하지 말아야 할 일이고, 3회차 보호조치는 2회차보다 비싸다. 그래서 해제했다.

```bash
launchctl bootout "gui/$(id -u)/com.stockmatrix.naver-blog"
```

**한 번도 실행된 적은 없다** — 로그 파일(`~/Library/Logs/stockmatrix-naver-blog.log`)이
존재하지 않고, plist 생성 시각(11:16)이 당일 예약 시각(10:00)보다 뒤였다. 즉 이 경로로
네이버에 접촉한 사실은 없다. 위험은 예정된 것이었고 제거됐다.

plist 파일은 **삭제하지 않았다.** 재개 시 되살릴 수 있다(§4).

## 2. 냉각 기간 중 금지 목록

- `naver-blog.yml` 재활성화
- `launchctl bootstrap ...` (launchd 등록)
- `npm run naver:publish` — **`--dry-run`도 금지.** dry-run도 실제로 로그인하고 에디터에 본문을 입력한다. 접근 자체가 위험이다
- `npm run naver:session` / `naver:session:push` / `session-sync.ts` — 네이버 서버에 접촉한다
- `npm run naver:login` — 사람이 계정 상태를 확인할 목적으로 직접 로그인하는 것은 별개이며, 그때 이 스크립트를 쓰지 말고 브라우저로 평소처럼 로그인한다
- 네이버 도메인에 요청을 보내는 모든 스크립트

**허용**: 코드 수정, 문서화, 네이버 접촉이 없는 단위 테스트.
`npx vitest run scripts/naver-blog`는 전부 픽스처 기반이라 안전하다(121 tests).

## 3. 로컬 러너 — 저장소로 옮기지 않는다 (결정)

### 결정

러너 스크립트를 저장소로 **옮기지 않는다.** 대신 내용을 이 문서에 그대로 남겨 버전 관리한다.

### 근거

1. **쓰일지 결정되지 않았다.** 정책 재설계안은 자동 발행을 아예 접고 "초안 자동 + 발행 수동"을 권한다. 그 결론이면 러너는 영구히 쓰이지 않는다. 쓰일지 모르는 실행 파일을 저장소에 두면 "준비됐다"는 잘못된 신호를 준다.
2. **버전 관리 요구는 문서화로 충족된다.** 문제는 "내용이 추적되지 않는 것"이었고, 아래 전문을 문서에 넣으면 해결된다. 실행 가능한 형태로 둘 필요는 없다.
3. **저장소에 두면 실수로 실행되기 쉽다.** `scripts/`에 있는 파일은 탭 자동완성과 스크립트 목록에 노출된다. 냉각 기간에는 그 표면을 늘리지 않는 편이 낫다.

Isaac이 §자동화 재개를 선택하면 그때 `scripts/naver-blog/runner/`로 옮기고 리뷰한다.

### 파일 위치

```
~/Library/LaunchAgents/com.stockmatrix.naver-blog.plist        # 매일 10:00, 현재 미등록
~/Library/Application Support/StockMatrix/naver-blog-daily.sh  # 러너
~/Library/Logs/stockmatrix-naver-blog.log                      # 로그 (현재 미생성)
```

### 러너 내용 (2026-09-03 시점)

단계는 CI와 같다: `session-sync` → `make-draft` → `publish`. `DRY_RUN=1`을 지원한다.
`.env.local`을 자동 로드하므로 시크릿 주입이 필요 없다.

```bash
#!/bin/bash
# StockMatrix 네이버 블로그 일일 발행 (로컬 실행)
set -uo pipefail

REPO="/Users/isaac/WebstormProjects/stock-ai-newsletter"
export PATH="/Users/isaac/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PLAYWRIGHT_BROWSERS_PATH="/Users/isaac/Library/Caches/ms-playwright"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
cd "$REPO" || { log "FATAL: 저장소 없음 $REPO"; exit 1; }
log "=== 시작 (node $(node -v)) ==="

# 1) 세션 접촉 — draft보다 먼저. 죽었으면 비용 쓰기 전에 멈춘다.
log "[1/3] 세션 확인·키프얼라이브"
npx tsx scripts/naver-blog/session-sync.ts || { log "FATAL: 세션 무효"; exit 1; }

# 2) 초안 생성 — 검색량 미달이면 여기서 정상 종료(발행 안 함)
log "[2/3] 초안 생성"
npx tsx scripts/naver-blog/make-draft.ts --out .naver-blog/draft.json || exit $?

# 3) 발행
# (DRY_RUN=1 이면 --publish 없이 실행)
```

### 로컬 전환의 근거와 한계

**근거**: GitHub Actions는 매일 다른 해외 IP에서 실행된다. 한국에서 만든 세션이 해외 IP에서
글을 쓰는 패턴은 "타인에 의한 로그인 의심"에 해당한다. 로컬이면 이 신호가 사라진다.

**한계**: 2026-09-03 **2회차 보호조치는 IP가 아니라 접근 빈도가 원인**이었다(해제 직후
자동 반복 접근). 따라서 **로컬 전환만으로 해결된다고 단정할 수 없다.** 로컬 전환은 신호 하나를
줄이는 조치이고, 빈도·외부링크·템플릿 획일성은 정책 재설계안에서 따로 다룬다.

또한 로컬 러너는 `session-sync`를 **매일** 호출한다. 발행이 주 2회로 줄면 키프얼라이브도
그에 맞춰야 한다 — 발행 없이 접근만 매일 늘리는 것은 이번 사고의 패턴과 같다.

## 4. 재개 절차

**판정은 Isaac이 한다. 코드나 에이전트가 자동으로 재개하지 않는다.**

### 4-1. 재개 전 확인 (전부 충족)

정책 재설계안 §5의 표를 쓴다. 요약:

1. 마지막 보호조치 해제 후 14일 경과
2. 그 기간 사람 로그인에서 보호조치·캡차·추가인증 0회
3. 기존 8편 중 삭제·블라인드 0건
4. 블로그가 네이버 검색에 정상 노출
5. 이용제한 안내 없음
6. 발행 빈도·외부링크 정책 변경이 코드에 반영됨
7. 계정 상태 감지기 동작 (`account-state.ts`, 구현·테스트 완료)

### 4-2. 켜는 순서 — 관찰을 건너뛰지 않는다

```
1) 사람이 수동으로 1편 발행                        → 48시간 관찰
2) dry-run 1회, 사람이 화면 확인                    → 48시간 관찰
3) 자동 주 1회, 4주                                → 무사고 확인
4) 자동 주 2회
```

어느 단계에서든 보호조치·캡차가 재발하면 **즉시 전면 중단하고 냉각 기간으로 돌아간다.**

### 4-3. 실행 경로를 켜는 명령

한 번에 하나만 켠다. CI와 launchd를 동시에 켜면 하루 2회 발행된다.

**launchd (로컬 — 권장 경로)**

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.stockmatrix.naver-blog.plist
launchctl list | grep stockmatrix   # 등록 확인
```

끄기: `launchctl bootout "gui/$(id -u)/com.stockmatrix.naver-blog"`

**GitHub Actions (해외 IP 신호 때문에 비권장)**

```bash
gh workflow enable naver-blog.yml
```

끄기: `gh workflow disable naver-blog.yml`

### 4-4. 재개 시 함께 조정할 것

- `WEEKLY_PUBLISH_LIMIT` 7 → 3 (`session.ts`)
- `naver-blog.yml` cron: 매일(`0 1 * * *`) → 주 2회
- 러너의 `session-sync` 호출 주기를 발행 주기에 맞춤
- `FORMAT-SPEC.md` §10 "글 유형 로테이션 (매일 1편)"과 §주간 상한 서술 갱신
- 외부링크·템플릿 다양성 변경 (정책 재설계안 §3·§4)

## 5. 사고 요약 (2026-09-03)

| 항목 | 내용 |
|---|---|
| 근본 원인 | **계정 보호조치.** 코드 결함이 아니다 |
| 1회차 | 오전 발견. 사람이 본인확인 + 비밀번호 변경으로 해제 |
| 신호 | 해제 직후 로그인에서 이미지 캡차 = 집중 감시 중 |
| 2회차 | 같은 날 오후 재발. 해제 직후 자동화된 반복 접근(`blog.naver.com` 팝업 6개+ 수 초 내)이 직접 원인 |
| 발행 결과 | 8/31 이후 발행 0건. 마지막 글 `224396153963`(8/31) |

### 반증된 가설 — 재조사 금지

| 가설 | 판정 | 근거 |
|---|---|---|
| 문서가 너무 크거나 이미지 처리 실패 | **반증** | run 33705246009 아티팩트 실측: 본문 2,043자, 이미지 5장 884KB |
| 임시저장 백로그 | **반증** | 에디터 저장 카운트 **0**. 비울 것이 없었다 |
| 방화벽이 네이버 OG 크롤러 차단 | **반증** | 로그에 `오글링크 실패` 없음 = 카드 정상 생성 |
| 계정 보호조치 | **확정** | 로그인 시 "아이디(...)를 보호하고 있습니다" 화면 실측 |

> Isaac에게 "임시저장을 비워보라"고 요청한 것은 **불필요했다**(카운트 0). 조사 과정에서
> 오류 메시지가 문서 원인을 가리켜 잘못된 방향으로 갔고, 그 메시지는 이번에 분리했다.
