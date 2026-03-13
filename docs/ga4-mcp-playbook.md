# GA4 MCP Playbook

이 프로젝트는 `Vercel Analytics`와 별도로 `GA4`를 함께 수집하도록 설계했다. `GA4 MCP`는 아래 데이터가 쌓인 뒤부터 바로 유의미해진다.

## 1. 필수 설정

- `.env.local`에 `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX` 추가
- GA4 관리 화면에서 `generate_lead`를 key event로 지정
- GA4 관리 화면에서 아래 event parameter를 custom dimensions로 등록

등록 권장 custom dimensions:

- `cta_location`
- `content_type`
- `destination_path`
- `filter_action`
- `filter_stage`
- `form_id`
- `lead_type`
- `result_count`
- `section_key`
- `section_stage`
- `sort_option`
- `theme_id`
- `theme_name`
- `theme_stage`

주의:

- 이메일, 이름 같은 PII는 절대 GA4로 보내지 않는다

## 2. 현재 계측 이벤트

- `page_view`
- `subscribe_cta_click`
- `archive_cta_click`
- `subscribe_form_submit`
- `subscribe_form_error`
- `generate_lead`
- `view_item_list`
- `select_item`
- `select_theme`
- `view_search_results`
- `view_theme_detail`
- `theme_filter_change`
- `theme_sort_change`
- `theme_section_toggle`
- `theme_list_load_more`

## 3. 이 사이트에서 바로 볼 분석 질문

### 유입 성과

- 어떤 landing page가 `generate_lead`를 가장 많이 만드는가?
- `sessionSourceMedium` 기준으로 어떤 채널이 `/subscribe` 전환율이 가장 높은가?
- 블로그 글, 테마 상세, 홈 중 어디가 구독 기여도가 높은가?

### 콘텐츠 성과

- 어떤 `/blog/*` 글이 `subscribe_cta_click`과 `generate_lead`를 가장 많이 유도했나?
- 어떤 `/themes/*` 페이지가 조회 대비 전환율이 높은가?
- `/archive` 방문자가 다시 `/subscribe`로 얼마나 이동하나?

### 전환 퍼널

- `page_view` on `/`
- `subscribe_cta_click`
- `page_view` on `/subscribe`
- `subscribe_form_submit`
- `generate_lead`

### 실시간 운영

- 지금 활성 사용자는 어떤 페이지에 몰려 있나?
- 실시간으로 `subscribe_cta_click`나 `generate_lead`가 발생하고 있나?

## 4. GA4 MCP에서 우선 많이 쓸 기능

우선순위:

1. `run_report`
2. `run_realtime_report`
3. `run_funnel_report`
4. `check_compatibility`
5. `get_custom_dimensions_and_metrics`

## 5. 바로 쓸 MCP 프롬프트 예시

### 최근 30일 랜딩 페이지 전환 분석

```text
GA4에서 최근 30일 기준으로 landing page 별 sessions, activeUsers, eventCount(generate_lead), sessionKeyEventRate를 보여줘.
landing page가 /, /blog/, /themes/, /subscribe 로 시작하는 것만 포함하고 전환율 높은 순으로 정렬해줘.
```

### 블로그 전환 기여도 분석

```text
GA4에서 최근 30일 동안 /blog/ 경로의 page path별 views, users, averageSessionDuration, subscribe_cta_click 수, generate_lead 수를 비교해줘.
조회수 대비 CTA율과 리드 전환율도 같이 계산해줘.
```

### 테마 상세 페이지 성과 분석

```text
GA4에서 최근 30일 기준 view_theme_detail 이벤트를 theme_name, theme_stage 기준으로 묶어서 eventCount와 users를 보여줘.
같은 기간 generate_lead와 연결해서 어떤 theme stage가 전환 기여가 높은지도 해석해줘.
```

### 테마 탐색 흐름 분석

```text
GA4에서 최근 30일 기준 view_item_list, select_item, view_theme_detail 이벤트를 함께 분석해줘.
어떤 theme_stage가 가장 많이 노출되고, 어떤 theme_name이 클릭률이 높고, 어떤 상세 페이지가 generate_lead에 가장 많이 기여하는지 정리해줘.
```

### 검색/필터 의도 분석

```text
GA4에서 최근 30일 기준 view_search_results, theme_filter_change, theme_sort_change 이벤트를 분석해줘.
search_term, filter_stage, sort_option 기준으로 사용자가 어떤 방식으로 테마를 탐색하는지 패턴을 요약해줘.
```

### CTA 위치별 성과 분석

```text
GA4에서 최근 30일 기준 subscribe_cta_click 이벤트를 cta_location 기준으로 집계해줘.
home_hero, home_bottom_cta, navigation, blog_post_cta 별 클릭 수와 이후 generate_lead 전환 해석을 붙여줘.
```

### 실시간 확인

```text
GA4 realtime 기준으로 activeUsers를 pagePath와 eventName 기준으로 보여줘.
현재 /subscribe 유입과 generate_lead 발생 여부를 우선 확인해줘.
```

### 퍼널 점검

```text
GA4 funnel report로 최근 14일 퍼널을 만들어줘:
1) home page_view
2) subscribe_cta_click
3) /subscribe page_view
4) subscribe_form_submit
5) generate_lead

이탈이 가장 큰 단계와 개선 가설도 같이 정리해줘.
```

## 6. 운영 권장 루틴

- 매일: realtime으로 `/subscribe` 유입과 `generate_lead` 확인
- 매주: landing page / blog / theme detail 전환 기여도 비교
- 매월: channel, device, country, new vs returning user 기준으로 세그먼트 분석

## 7. 다음 확장 후보

- 아카이브 카드 클릭이 중요하면 `select_content` 또는 custom click 이벤트 추가
- 뉴스레터 메일 클릭까지 보려면 UTM 전략과 이메일 링크 태깅 정비
- GA4에서 `result_count`를 실제 custom metric으로 등록해 검색 결과 품질까지 정량화

## 8. 공식 참고

- Google Analytics MCP server: https://github.com/googleanalytics/google-analytics-mcp
- Google Analytics Data API: https://developers.google.com/analytics/devguides/reporting/data/v1
- GA4 web events guide: https://developers.google.com/analytics/devguides/collection/ga4/events
