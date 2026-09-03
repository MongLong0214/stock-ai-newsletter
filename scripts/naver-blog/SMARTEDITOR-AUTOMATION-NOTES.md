# 스마트에디터 ONE 자동화 — 실측 노트

> 2026-08-27, `blog.naver.com/stock-matrix`에서 DOM 실측 + CI 6회 실행(실발행 3편)으로
> 확인한 내용. 추측이 아니라 재현된 것만 적었다.
>
> 대상 코드: `scripts/naver-blog/publish.ts`, `capture-images.ts`, `readability.ts`

## 0. "30초 뒤 꺼진다"의 정체

Playwright 기본 타임아웃이 정확히 **30,000ms**다. 30초 실패는 곧
`locator.click()` / `waitFor()`가 **끝까지 actionable이 되지 않는 요소를 기다린 것**이다.
스마트에디터에서 이 증상의 원인은 사실상 셋뿐이다.

1. 그 버튼이 **현재 툴바 모드에 존재하지 않는다** (§1)
2. **오버레이가 포인터 이벤트를 가로챈다** (§2, §3)
3. **없는 값을 기다린다** — 팔레트에 없는 색 등 (§4)

조작별 타임아웃을 5~10초로 낮추고 실패 메시지에 "어떤 조작"인지 박으면 원인이 바로 드러난다.
통짜 30초 대기는 원인을 지운다.

## 1. 툴바가 캐럿 위치에 따라 교체된다 (최다 원인)

실측:

```
캐럿 = 제목 컴포넌트  →  title-font-size 만 존재
                         bold · font-color · background-color · font-size 는 DOM에서 사라짐
캐럿 = 본문 컴포넌트  →  bold · italic · underline · font-color · background-color · font-size … 전부 존재
```

제목에 캐럿이 있는 상태로 `button[data-name="font-color"]`를 클릭하려 하면 그 요소는
**영원히 나타나지 않는다.** 30초 타임아웃.

함정: `.se-text-paragraph` first()는 **제목**이다.

```
제목: .se-section-documentTitle .se-text-paragraph
본문: .se-section-text .se-text-paragraph
```

### 대응

서식 조작 직전에 툴바 모드를 단정한다. 이 단정 하나가 "팔레트 셀을 찾지 못했습니다" 같은
엉뚱한 오류로 원인이 가려지는 것을 끊는다.

```ts
const bold = await editor.locator('button[data-name="bold"]').filter({ visible: true }).count();
if (bold === 0) {
  const titleMode = await editor.locator('button[data-name="title-font-size"]')
    .filter({ visible: true }).count();
  throw new Error(titleMode > 0
    ? '캐럿이 제목 컴포넌트에 있습니다 — 본문을 먼저 클릭해야 합니다.'
    : '툴바를 찾지 못했습니다 — 복구 팝업이 남아 있거나 셀렉터가 바뀌었습니다.');
}
```

## 2. 복구 팝업의 dim이 모든 클릭을 가로챈다

`작성 중인 글이 있습니다` 팝업은 dim 오버레이를 깐다. 에러 로그 실측:

```
<div class="se-popup-dim se-popup-dim-white"></div> from
<div data-name="se-popup-alert se-popup-alert-confirm"> subtree intercepts pointer events
```

**핵심**: 이전 실행이 본문을 입력했다면 네이버가 임시저장을 남긴다. 그래서 **다음 실행은
반드시 이 팝업을 만난다.** CI에서 1차는 새 블로그라 팝업이 없어 성공했고, 2차부터 제목
클릭 단계에서 죽었다 — **첫 실행만 성공하고 그다음부터 매일 실패**하는 구조였다.

### 대응

고정 대기(2초)로는 부족하다. 등장을 기다리고, **닫힌 것을 확인**한다.

```ts
const blocker = () => editor.locator('.se-popup-dim, .se-popup-alert').filter({ visible: true });
await blocker().first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
if ((await blocker().count()) === 0) return;            // 팝업 없음 — 통과

for (let i = 1; i <= 3; i += 1) {
  // 취소 = 임시저장분 무시하고 새 글. 프레임·최상위 양쪽에서 찾는다.
  for (const scope of [editor, page]) {
    const btn = scope.locator('button, [role="button"], a')
      .filter({ hasText: /^\s*(취소|새로\s*작성|아니오)\s*$/ })
      .filter({ visible: true }).first();
    if (await btn.count()) { await btn.click({ timeout: 3_000 }).catch(() => {}); break; }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await blocker().first().waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {});
  if ((await blocker().count()) === 0) return;
}
throw new Error('복구 팝업을 닫지 못했습니다 — 이 상태에서는 모든 클릭이 가로채입니다.');
```

## 3. 도움말 패널이 다시 열린다

`article.se-help-panel.se-is-on`이 툴바·발행 버튼 위를 덮는다. 닫아도 재등장한다.
클래스 제거 + `display:none` + `pointerEvents:none`을 강제로 박고, **이미지 삽입 직전마다
다시 정리**해야 한다.

번역(Papago) 모달도 같은 부류다 — 한 번 열리면 본문을 덮어 이후 조작이 전멸한다.

## 4. 색상 팔레트 — 함정 셋

### (a) 팔레트에 없는 색을 기다린다

셀에 `data-color` 속성이 있다. `.se-color-palette[data-color="#ff0010"]` 로 정확 매칭된다.
실측 셀 **72개** (`.naver-blog/verify/palette-dump.json`).

```
#ff0010  있음   ← 한국 주식 관행의 상승 빨강, 그대로 쓸 수 있다
#0068ff  없음   ← 하락 파랑. 팔레트에 아예 없다
파랑 계열 실제:  #0095e9 · #0078cb · #00b3f2 · #004e82
#555555  있음   ← 본문 기본 텍스트색(computed rgb(85,85,85))과 동일 = 리셋용
```

없는 색을 지정하면 그 셀을 기다리다 30초 죽는다. **팔레트를 먼저 실측하고 상수를 맞춰라.**

### (b) 문서 전체 근사 매칭 → 엉뚱한 버튼 클릭

정확 매칭이 실패했을 때 문서 전체(`button, span, div, i, em`)에서 배경색 근사값으로
클릭하면, 팔레트 셀이 아니라 **툴바의 「번역」 버튼**을 누른다. 실측에서 Papago 모달이
본문을 덮어 이후 이미지 삽입 3회가 전부 filechooser 타임아웃으로 죽었다.

폴백을 두더라도 **`.se-color-palette[data-color]` 안으로 한정**하고, 폴백을 탔다는 사실을
경고로 남겨 상수를 고치게 해야 한다.

### (c) 팔레트가 열린 채 다음 입력 → 첫 글자가 먹힌다

이게 가장 조용한 결함이다. 실측에서 마침표 하나가 사라져 두 문장이 한 줄로 붙은 글이
**실제로 공개됐다** (`[[r:늘었습니다]]. 검색…` → `늘었습니다 검색…`).
길이 검증은 1자 차이로 걸리지 않는다.

Escape만으로는 부족했다. 포커스가 본문으로 확실히 돌아오지 않는다. 클릭으로 되돌리면
캐럿이 클릭 지점에 놓여 글자가 문단 중간에 끼어든다. **Range를 문단 끝으로 접어 선택을
다시 심어야** 해결된다.

```ts
await editor.evaluate(() => {
  const paras = [...document.querySelectorAll('.se-component.se-text .se-text-paragraph')];
  const last = paras[paras.length - 1];
  if (!(last instanceof HTMLElement)) return;
  last.focus?.();
  const range = document.createRange();
  range.selectNodeContents(last);
  range.collapse(false);            // 내용 끝으로
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
});
```

로컬에서는 통과하고 CI에서만 실패하는 타이밍 의존 결함이었다. **3단계 걸려 잡았다**:
Escape만 → 팔레트 숨김 확인 → 캐럿 Range 복원.

## 5. 이미지 삽입

`input[type=file]`이 없으므로 `setInputFiles`가 안 된다. **클릭 전에 filechooser 이벤트를
무장**해야 한다.

```ts
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 10_000 }),
  editor.locator('.se-image-toolbar-button').filter({ visible: true }).first().click(),
]);
await chooser.setFiles([file]);
```

오버레이가 하나라도 떠 있으면 chooser가 열리지 않고 그대로 타임아웃이다 — **삽입 직전
오버레이 정리가 필수**다.

업로드 완료 판정은 컴포넌트 생성이 아니라 **CDN src**로 본다.

```
.se-component.se-image img[src*="pstatic.net"]
```

### 개수 세기 함정

```
잘못:  '.se-component.se-image, .se-module-image img'   ← 후자가 전자의 자식 = 장당 2회
맞음:  '.se-component.se-image'
```

이중 계산 하나가 두 증상으로 나타났다: (1) "이미지 8장(최대 7)" 오탐으로 정상 글 반려,
(2) `nth(before)`가 없는 인덱스를 기다려 **장당 30초** 낭비.

재시도 시에는 **재시도 전에 개수를 확인**해야 한다. 안 하면 같은 이미지가 중복 업로드된다
(실측 6장 → 16장, 네이버가 "발행 오류"로 거부).

## 6. 구조 — 조작 수를 줄이는 것이 최선의 안정화

블록마다 폰트·크기·줄간격·정렬·색·배경색을 반복 조작하면 팝업 열고 닫기가 수백 회다.
각각이 §1~§4에 걸릴 기회다.

**조작 종류를 3개로 줄였다.**

```
인용구  >> 소제목       툴바 인용구 버튼 + 스타일 서브패널
볼드    **텍스트**      단축키(Meta+B / Control+B) → 실패 시 툴바 버튼
색상    [[r:텍스트]]    팔레트 data-color 정확 매칭
```

**폰트·크기·줄간격·정렬은 아예 건드리지 않는다.** 기본값으로 충분하고, 만질수록 실패
지점만 늘어난다.

### 블록 시작 지점에는 서식을 적용하지 마라 (중요)

**줄바꿈 직후 문단의 첫 위치**에서는 볼드·색상 적용이 신뢰할 수 없다.

- 캐럿만 둔 상태의 토글은 "다음 입력에 적용"으로 동작하지 않는다. 툴바 버튼은 활성으로
  바뀌지만 이어서 입력한 글자에는 붙지 않는다.
- 입력 후 `Shift+ArrowLeft`로 선택하는 방식도 문단 경계에서 어긋난다.

실측으로 확인한 방식:

```
theme 글의 관련종목 목록      통과 — 볼드 앞에 평문 문장이 있어 캐럿이 텍스트 노드 안에 있었다
ranking 글의 테마 목록        실패 — 블록이 `① **테마명**`으로 시작한다
similar 글의 비교 목록        실패 — 같은 구조
news 글의 기사 제목 목록      실패 — 같은 구조
```

theme이 통과한 것은 **우연**이었다. 그래서 조합기 규칙을 이렇게 뒀다.

- 번호 목록(①②…) 항목에는 볼드를 쓰지 않는다
- 볼드는 **산문 문단 중간**의 수치·핵심어에만 쓴다
- 규격 하한(10~20회)은 산문에서 채운다

### 서식 적용 판정은 문단 기준으로, 정착 시간을 두고

볼드 카운트가 `.se-component` 하위만 보면 **적용됐는데도 0으로 읽힌다**(플로팅 툴바 B가
활성인데 카운트가 안 늘어 정상 적용을 실패로 판정했다).

```
잘못:  '.se-component span, .se-component b, .se-component strong'
맞음:  '.se-text-paragraph' 별로 순회 + 중첩 span 제외 + 제목 섹션 제외
```

그리고 서식 반영은 즉시가 아니다. 적용 직후 바로 세면 정상 적용도 실패로 읽힌다 —
**250ms 정착 후 측정**한다.

### "평문 먼저, 서식 나중" 리팩터는 시도했고 **실패했다**

이론적으로는 이쪽이 맞다 — 타이핑과 서식을 분리하면 모드 누수·팝업 간섭·화살표 드리프트가
한꺼번에 사라진다. 실제로 구현해 봤다(문단 전체를 평문으로 넣고, 각 구간을 DOM Range로
선택해 서식을 입히는 방식).

**결과는 더 나빴다.** 문단 전체가 볼드가 됐다. 원인을 끝까지 좁히지 못했다 —
선택 범위는 맞게 잡히는데(스크린샷으로 확인) 적용 결과가 문단 전체로 번졌다.

그래서 **실제 발행 3편을 통과한 구현을 유지**하기로 했다. 무인 운영에서는 "이론적으로 더
나은 미검증 코드"보다 "실측으로 통과한 코드"가 맞다. 대신 취약 위치는 **조합기에서 피한다**
(블록 시작 지점에 서식을 두지 않는다).

다시 시도할 사람을 위해 남기는 관찰:
- 선택은 `document.createRange()`로 정확히 잡힌다. 화살표 키 선택보다 확실하다.
- `page.evaluate` 콜백 안에 명명 함수(화살표 포함)를 두면 tsx가 `__name`을 주입해
  브라우저에서 `ReferenceError: __name is not defined`로 죽는다. 전부 인라인으로 써라.
- 선택 후 단축키 토글은 **모드를 남긴다.** 이어지는 평문까지 굵어지고, 다음 서식 구간은
  토글이 OFF로 작동해 적용이 취소된다. 이것이 "한 줄의 두 번째 볼드가 실패"의 정체다.

### 실패 시 같은 텍스트를 다시 타이핑하지 마라

전략(단축키 → 다른 단축키 → 툴바)을 바꿀 때마다 같은 텍스트를 재입력하면, 3전략 실패 시
본문에 같은 문구가 세 번 남는다. 검증에서 걸리기 전에 이미 임시저장에 오염된 본문이 들어간다.

### 줄바꿈은 조작이 아니라 텍스트 분할로

스마트에디터는 `\n\n`으로 나뉜 블록마다 별도 문단 컴포넌트를 만든다. 그래서 **본문을 미리
쪼개 두면 조작 0회로 줄바꿈이 된다.** 발행기를 건드릴 필요가 없다.

`readability.ts` 규칙:
- 볼드 리드 문장(30자 이내)은 별도 문단으로 분리 — 안 하면 뒤 문장과 한 줄로 붙는다
- 일반 문단은 최대 2문장 / 110자 (네이버 모바일 본문 폭 ≈ 360px)
- 인용구(`>> `)·이미지 슬롯·URL 단독·번호 목록(①②…)은 그대로 유지
- 문장 경계는 마침표가 아니라 **한국어 종결어미**(다·요·죠·까·함·음) 기준.
  `2026.08`, `40.3`, `stockmatrix.co.kr`을 문장 끝으로 오해하지 않는다.
  종결어미 뒤에 마커가 붙는 경우(`[[r:늘었습니다]].`, `**있습니다**.`)도 경계로 본다

실측: 문단 23개 → 42개, 최대 104자, 110자 초과 0개.

### 이미지 배치도 조작이 아니라 슬롯으로

본문에 `{{image:1-hero}}` 슬롯을 넣고 발행기가 슬롯 위치에 삽입한다. 문단 인덱스로
계산하면 인용구 문단이 슬롯에 걸려 건너뛰어지고, 남은 이미지가 글 끝에 몰린다
(실측: CTA 뒤에 3장 연속). 배치 실패는 **발행 중단 사유**로 두고 글 끝에 붙이지 않는다.

## 7. 검증은 기억이 아니라 DOM에서

"적용했다는 기록"은 무의미하다. 발행 직전에 되읽는 값:

| 항목 | 방법 |
|---|---|
| 볼드 | computed `font-weight` ≥ 600 개수 |
| 색상 | computed `color` 개수 **+ 색상 글자 수** |
| 인용구 | `.se-component.se-quotation` 개수 + 각 텍스트가 소제목 한 줄인지 |
| 이미지 | `.se-component.se-image` 개수 |
| 본문 길이 | **텍스트 컴포넌트만** 합산 (`.se-component.se-text .se-text-paragraph`) |
| 본문 누락 | 앞·뒤 앵커 + **마침표 개수** |
| 태그 | 해시 클래스가 아니라 `#태그` 텍스트 존재 여부 |
| 카테고리 | 선택 결과 텍스트 되읽기 |
| CTA | 오글링크가 마지막 컴포넌트인지, 뒤에 컴포넌트 0개인지 |

### 특히 중요한 두 가지

**색상 글자 수** — 개수만 세면 리셋 실패로 문단 전체가 빨강이 돼도 "색상 4개"로 통과한다.
초안 마커 글자 수의 2배+20자를 넘으면 번진 것으로 본다.

**마침표 개수** — 1자 유실은 길이 검사로 안 걸린다. 이 검증이 없었으면 §4(c) 결함이 세 번
연속 "성공"으로 보였다. 인용구·URL 블록은 텍스트 컴포넌트에 안 들어가므로 기대값에서 뺀다.

### 길이 비교는 루트 전체에서 하지 말 것

에디터 루트(`.se-content`)를 재면 제목·이미지 캡션·에디터 UI 문구가 길이를 보충해
**중간 문단 200자 누락이 90% 기준을 통과**한다. 텍스트 컴포넌트만 합산해야 한다.

### 태그 검증에 해시 클래스를 쓰지 말 것

`tag_item__ISVjt` 같은 클래스는 배포마다 바뀐다. 태그 11개가 정상 입력됐는데 클래스 미스로
발행이 막혔다. `document.body.innerText`에 `#태그`가 있는지 본다 — 본문에는 `#`가 없어
오검출이 없다.

## 8. 세션·계정

- **로그인은 자동화하지 않는다.** 네이버 로그인은 봇 탐지가 가장 강한 지점이고(캡차·신규기기
  인증·2FA) 자동화하면 계정 자체가 위험하다. 사람이 한 번 로그인해 세션을 저장하고
  발행 스크립트가 재사용한다.
- `NID_AUT`는 **HttpOnly**라 `document.cookie`로 안 보인다. `context.cookies()`로 읽는다.
- CI는 세션을 base64 시크릿으로 주입한다. **데이터센터 IP에서도 통했다**(실측 CI 6회).
  단 조용히 만료될 수 있으므로 만료를 감지해 실패시켜야 한다.
- 블로그 ID 자동 감지: `blog.naver.com/MyBlog.naver` 리다이렉트에서 뽑는다.
  정규식이 **하이픈을 허용**해야 한다(`stock-matrix`).
- 세션 파일은 `0600`, 상태 디렉터리는 `0700`.

## 9. CI에서만 드러나는 것

로컬 dry-run으로는 안 나오고 실제 러너에서만 나온 실패들:

| 결함 | 로컬 | CI |
|---|---|---|
| 복구 팝업(임시저장 잔존) | 통과 | 2차부터 실패 |
| 색상 팝업 입력 유실 | 통과 | 마침표 2개 유실로 검증 반려 |
| `issues: write` 누락 | 해당 없음 | 실패 알림이 403으로 무동작 |

`permissions: issues: write`가 없으면 실패 이슈 생성이 403이다
(`x-accepted-github-permissions: issues=write`). **실패 알림이 한 번도 동작한 적 없는
상태**가 될 수 있다.

발행 이력·쿨다운은 러너 디스크에 두면 매 실행 초기화된다. `actions/cache`로 넘기되
키에 `run_id`+`run_attempt`를 넣어야 한다(같은 키는 덮어쓰지 못한다). 발행 성공 후 상태
저장 실패를 `continue-on-error`로 넘기면 다음 실행이 이력을 잃는다 — **잡을 실패시켜야
한다.**

증거 아티팩트는 **`include-hidden-files: true`가 없으면 한 건도 올라가지 않는다.**
`.naver-blog`는 점으로 시작하는 숨은 디렉터리이고 `actions/upload-artifact` v4는 숨은
파일을 기본 제외한다. 글롭을 세 가지로 바꿔봤지만(디렉터리 표기 `.naver-blog/`,
개별 글롭 나열, `.naver-blog/**`) 전부 `total_count=0`이었다 — 글롭 문제가 아니었다.

```yaml
include-hidden-files: true
path: |
  .naver-blog/**
  !.naver-blog/session.json
if-no-files-found: error     # warn이면 또 조용히 죽는다
```

이 플래그를 켜는 순간 `!.naver-blog/session.json`이 실제로 부하를 받는 줄이 된다.
세션 쿠키가 아티팩트로 새면 계정이 털린다 — **제외 줄을 지우지 말고, 켠 다음 실행에서
아티팩트 내용에 세션이 없는지 직접 확인하라.**

이게 왜 중요한가: 이 문서의 문자 유실 3건·복구 팝업·Papago 모달은 전부 로컬에서
재현되지 않았다. 스크린샷이 유일한 진단 수단인데 그게 비어 있으면 CI-only 실패는
추측으로만 고치게 된다.

## 10. 하지 말 것

- **임시저장 후 재열기 수정 루프** — 네이버는 발행 후 잦은 수정을 문서 신뢰도 감점으로
  본다. "고쳐서 다시 올리기"보다 **발행 전 검증에서 막고 그 회차를 거르기**가 맞다.
  무인 운영에서는 깨진 글을 남기는 것보다 하루 안 쓰는 게 싸다.
- **지원 안 되는 서식을 조용히 대체** — 색상 자동화가 안 되면 볼드로 강등하지 말고 중단하거나
  문서에서 요구를 지워라. 문서와 구현이 다른 상태를 남기면 다음 사람이 같은 함정을 밟는다.
- **dry-run을 남긴 채 방치** — 임시저장이 남아 다음 실행이 §2에 걸린다. 팝업 처리를 넣기
  전까지는 dry-run 자체가 다음 실행을 깨뜨린다.

## 부록 — 실측 셀렉터

```
에디터 프레임        #mainFrame
제목                 .se-section-documentTitle .se-text-paragraph
본문                 .se-section-text .se-text-paragraph
텍스트 컴포넌트      .se-component.se-text .se-text-paragraph
인용구 컴포넌트      .se-component.se-quotation
이미지 컴포넌트      .se-component.se-image
업로드 완료 판정      .se-component.se-image img[src*="pstatic.net"]
이미지 버튼          .se-image-toolbar-button
인용구 버튼          .se-quotation-toolbar-button
인용구 스타일 서브패널 .se-insert-menu-sub-panel-button
볼드 버튼            button[data-name="bold"]
글자색 버튼          button[data-name="font-color"]
제목 모드 판별        button[data-name="title-font-size"]   ← 이게 보이면 캐럿이 제목에 있다
팔레트 셀            .se-color-palette[data-color="#ff0010"]
오글링크 버튼        .se-oglink-toolbar-button
오글링크 카드        .se-oglink   (div.se-component.se-oglink)
오글링크 제목·도메인  .se-oglink-title / .se-oglink-url

오글링크 카드에는 에디터 DOM 기준 `<a href>`가 **없다**(2026-09-03 실측). 링크는
컴포넌트 데이터에 있고 앵커는 발행된 글에서만 생긴다. `.se-oglink-thumbnail`도 OG
이미지가 로드될 때만 붙는다 — 둘 중 어느 것으로도 카드 유무를 판정하면 정상 카드를
누락으로 오판해 발행이 막힌다. 카드 존재는 `.se-oglink` 컴포넌트로, 대상 확인은
`.se-oglink-url` 텍스트의 도메인으로 본다.
복구 팝업 오버레이    .se-popup-dim / .se-popup-alert
도움말 패널          .se-help-panel.se-is-on
```

발행 성공 판정은 URL 이동만 보면 안 된다. 네이버가
`발행 오류 — 문서 처리 중 오류가 발생하였습니다` 팝업을 낼 수 있으므로 둘을 경합시킨다.

```ts
const outcome = await Promise.race([
  page.waitForURL(/blog\.naver\.com\/(?!.*postwrite)/, { timeout: 45_000 }).then(() => 'ok'),
  editor.locator('text=/발행 오류|처리 중 오류/').first()
    .waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'error'),
]).catch(() => 'timeout');
```

`error`(명시적 오류)와 `timeout`(결과 미확인)을 **구분해야 한다.** 전자는 게시되지 않았음이
확실하므로 pending 표식을 지워야 하고, 후자는 게시됐을 수 있으므로 사람 확인 전까지 재발행을
막아야 한다.
