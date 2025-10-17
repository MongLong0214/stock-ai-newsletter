# X(Twitter) 자동 게시 설정 가이드

매일 오전 7:50에 뉴스레터가 발송되면서 동시에 X(트위터)에 자동으로 게시됩니다.

## 1. X API 키 발급 받기

### Free Tier ($0/월)
무료 플랜으로 충분합니다. 제한사항:
- 월 1,500개 트윗 게시 가능
- 매일 7개 트윗 = 월 약 210개 트윗 사용 (충분함)

### 발급 절차

1. **X Developer Portal 접속**
   - https://developer.twitter.com/en/portal/dashboard
   - X 계정으로 로그인

2. **프로젝트 생성**
   - "Projects & Apps" → "Create Project"
   - Project Name: `stock-matrix-newsletter`
   - Use Case: `Making a bot`
   - Description: `Daily stock analysis newsletter automation`

3. **앱 생성**
   - App Name: `StockMatrixBot`
   - App Environment: `Production`

4. **API Keys 발급**
   - "Keys and Tokens" 탭 클릭
   - **API Key and Secret** 생성
     - `API Key`: 저장 (TWITTER_API_KEY)
     - `API Key Secret`: 저장 (TWITTER_API_SECRET)

   - **Access Token and Secret** 생성
     - "Generate" 버튼 클릭
     - `Access Token`: 저장 (TWITTER_ACCESS_TOKEN)
     - `Access Token Secret`: 저장 (TWITTER_ACCESS_SECRET)

5. **권한 설정**
   - "User authentication settings" → "Set up"
   - App permissions: **Read and Write** 선택
   - Type of App: **Automated App or Bot**
   - Callback URL: `http://localhost:3000` (필수 입력)
   - Website URL: `https://stockmatrix.co.kr`

⚠️ **중요**: API Keys는 한 번만 보여지므로 반드시 안전한 곳에 저장하세요!

## 2. GitHub Secrets 등록

GitHub 저장소에 API 키를 안전하게 저장합니다.

1. **GitHub 저장소 접속**
   - `https://github.com/[username]/stock-ai-newsletter`

2. **Settings → Secrets and variables → Actions**

3. **New repository secret** 클릭하여 4개 등록:

   ```
   Name: TWITTER_API_KEY
   Value: [발급받은 API Key]
   ```

   ```
   Name: TWITTER_API_SECRET
   Value: [발급받은 API Key Secret]
   ```

   ```
   Name: TWITTER_ACCESS_TOKEN
   Value: [발급받은 Access Token]
   ```

   ```
   Name: TWITTER_ACCESS_SECRET
   Value: [발급받은 Access Token Secret]
   ```

## 3. 로컬 테스트 (선택)

로컬에서 테스트하려면 `.env.local` 파일 생성:

```bash
# .env.local
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
```

테스트 실행:
```bash
npm run send-newsletter
```

## 4. 동작 확인

1. **수동 실행으로 테스트**
   - GitHub Actions → "Daily Stock Newsletter" → "Run workflow"
   - 약 4분 후 X 계정에서 트윗 확인

2. **자동 실행 확인**
   - 평일 오전 7:50 KST에 자동 실행
   - GitHub Actions → "Daily Stock Newsletter" → 최근 실행 기록 확인

## 5. 트윗 형식

### 스레드 구조 (총 7개 트윗)

**트윗 1 (헤더)**
```
📊 STOCK MATRIX - 2024년 12월 20일

AI 기술적 분석으로 선정한 5종목
30개 지표 분석 결과 공유

⚠️ 투자 권유가 아닌 참고용 기술적 데이터
```

**트윗 2-6 (각 종목 상세)**
```
🔥 1. 삼성전자 (KOSPI:005930)

📈 종합점수: 88점
📊 추세: 92 | 모멘텀: 85
💹 거래량: 90 | 변동성: 82

주요 지표:
• SMA 완전정배열
• EMA 골든크로스
• RSI 58 강세권
• MACD 양전환
```

**트윗 7 (CTA)**
```
📧 매일 오전 7:50 무료 뉴스레터

전체 30개 지표 분석 결과를
이메일로 받아보세요

👉 https://stockmatrix.co.kr

#주식 #AI분석 #기술적분석 #KOSPI #KOSDAQ
```

## 6. 비용

- **X API Free Tier**: $0/월
- **트윗 사용량**: 월 약 210개 (한도: 1,500개)
- **추가 비용**: 없음

## 7. 트러블슈팅

### 트윗 게시 실패
```
⚠️ X(Twitter) 게시 실패 (뉴스레터는 정상 발송됨)
```
- API 키 확인: GitHub Secrets 정확히 입력되었는지 확인
- 권한 확인: App permissions이 "Read and Write"인지 확인
- Rate Limit: 월 1,500개 한도 초과하지 않았는지 확인

### Rate Limit 초과 시
```
Error: Rate limit exceeded
```
- Free Tier: 월 1,500개 제한
- 해결: 다음 달까지 대기 또는 Basic Plan($100/월) 업그레이드

### API 키 오류
```
Error: Twitter API credentials are not configured
```
- GitHub Secrets에 4개 키 모두 등록되었는지 확인
- 키 이름 정확히 입력: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, etc.

## 8. 커스터마이징

### 트윗 형식 변경
`lib/twitter.ts` 파일의 `formatTweetThread` 함수 수정

### 단일 트윗으로 변경 (스레드 대신)
`scripts/send-newsletter.ts`:
```typescript
// 기존 (스레드)
await postNewsletterToTwitter(analysisData, true);

// 변경 (단일 트윗)
await postNewsletterToTwitter(analysisData, false);
```

### 트윗 비활성화
`scripts/send-newsletter.ts`에서 해당 블록 주석 처리:
```typescript
// 5. X(Twitter) 자동 게시
// try {
//   ...
// } catch (twitterError) {
//   ...
// }
```

## 9. 참고 자료

- X API 공식 문서: https://developer.twitter.com/en/docs
- twitter-api-v2 라이브러리: https://github.com/PLhery/node-twitter-api-v2
- X Developer Portal: https://developer.twitter.com/en/portal/dashboard