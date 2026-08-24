# SendGrid → AWS SES 마이그레이션 런북

> 코드는 **provider 스위치**로 배포됨: `EMAIL_PROVIDER` 미설정/`sendgrid` = 현행 SendGrid(무변경), `EMAIL_PROVIDER=ses` = SES.
> 그래서 이 브랜치를 머지해도 **env를 바꾸기 전까지 동작은 그대로**다. 아래는 SES로 실제 전환하려면 **이삭이 직접 해야 할 일**.

---

## ⚠️ 먼저 — AWS 계정/권한 (확인 완료 사항)
- 현재 로컬 `~/.aws` 프로필은 **`default` 하나뿐**, 계정 **471112896273**, 유저 **`portal-s3-public-user`** = **S3 전용**. `ses:*`/`iam:*` **권한 없음**.
- → **SES/IAM 권한이 있는 admin 프로필이 필요**하다. 그리고 **SES를 이 S3용 계정(471112896273)에 둘지, 별도 계정에 둘지 결정**해야 한다.

---

## Step 1. AWS admin 프로필 준비
```bash
aws configure --profile stockmatrix-admin   # SES+IAM 권한 키 입력, region ap-northeast-2
aws sts get-caller-identity --profile stockmatrix-admin   # 계정/유저 확인
```

## Step 2. 인프라 프로비저닝 (Terraform)
```bash
cd infra/ses
terraform init
terraform apply -var="aws_profile=stockmatrix-admin"
```
생성물: SES 도메인 아이덴티티+DKIM, custom MAIL FROM, configuration set, 발송 전용 IAM 유저+액세스키.

## Step 3. DNS 레코드 입력 (hosting.co.kr 패널) ← 자동화 불가, 수동
```bash
terraform output dkim_cname_records      # CNAME 3개
terraform output mail_from_mx_record     # MX
terraform output mail_from_spf_txt       # TXT (SPF)
terraform output dmarc_txt_recommended   # TXT (_dmarc, 권장)
```
- **CNAME 3개**: `<token>._domainkey.stockmatrix.co.kr` → `<token>.dkim.amazonses.com`
- **MX**: `mail.stockmatrix.co.kr` → `feedback-smtp.ap-northeast-2.amazonses.com` (우선순위 10)
- **TXT(SPF)**: `mail.stockmatrix.co.kr` → `v=spf1 include:amazonses.com ~all`
- **TXT(DMARC)**: `_dmarc.stockmatrix.co.kr` → `v=DMARC1; p=none; rua=mailto:noreply@stockmatrix.co.kr; fo=1`

## Step 4. 도메인 인증 확인 (DNS 전파 후, 최대 수십 분~수시간)
```bash
aws sesv2 get-email-identity --email-identity stockmatrix.co.kr \
  --profile stockmatrix-admin --region ap-northeast-2 \
  --query '{verified:VerifiedForSendingStatus, dkim:DkimAttributes.Status}'
# verified=true, dkim=SUCCESS 여야 함
```

## Step 5. 샌드박스 해제 (프로덕션 액세스) ← AWS 사람 심사 ~24h
- 콘솔: SES → Account dashboard → **Request production access** (용도/발송량/바운스 처리 기재)
- 또는 CLI:
```bash
aws sesv2 put-account-details --production-access-enabled \
  --mail-type TRANSACTIONAL --website-url https://stockmatrix.co.kr \
  --use-case-description "Daily opt-in stock analysis newsletter to subscribers" \
  --profile stockmatrix-admin --region ap-northeast-2
```
> 샌드박스에선 **인증된 주소로만** 발송 + 하루 200통 제한. 해제 전엔 실서비스 발송 불가.

## Step 6. env 설정 (아직 SES로 전환하지 말 것)
**Vercel(크론 API용) + GitHub Actions secrets(발송 스크립트용) 둘 다**에 추가:
```
AWS_ACCESS_KEY_ID      = (terraform output ses_access_key_id)
AWS_SECRET_ACCESS_KEY  = (terraform output -raw ses_secret_access_key)
AWS_REGION             = ap-northeast-2
SES_FROM_EMAIL         = noreply@stockmatrix.co.kr   # IAM 정책 조건과 반드시 일치
```
`EMAIL_PROVIDER`는 **아직 넣지 마** (테스트 먼저).

## Step 7. 테스트 발송 (SES로, 본인 주소)
```bash
EMAIL_PROVIDER=ses npx tsx scripts/send-test-email.ts   # 본인 이메일 수신 확인
```
네이버/다음/Gmail 각각 **받은편지함 vs 스팸함** 확인.

## Step 8. 컷오버 & 롤백
- 컷오버: Vercel + GitHub Actions에 **`EMAIL_PROVIDER=ses`** 설정 → 다음 발송부터 SES.
- **롤백(즉시)**: `EMAIL_PROVIDER`를 지우거나 `sendgrid`로 → SendGrid로 복귀. 코드/재배포 불필요.
- 안정화(1~2주) 후 SendGrid 구독 해지.

---

## 도달률 주의 (라이브 뉴스레터 리스크)
- 신규 SES 도메인은 **발송 평판 0** → 초기 네이버/다음 스팸함 가능. DMARC/SPF/DKIM 정렬 필수(위 DNS로 충족).
- 첫 며칠은 **소량부터** 늘려 워밍업. 바운스/컴플레인율 모니터링(configuration set 지표).
- 문제 시 Step 8 롤백으로 즉시 SendGrid 복귀.

## 비용
- SES: ~$0.10/1,000통 → 월 ~9천통 = **~$1/월** (SendGrid $20 대비 ~$19 절감). EC2 밖 발송이라 무료 티어 미적용.
