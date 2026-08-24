# ── hosting.co.kr DNS 패널에 추가할 레코드들 ─────────────────────
# terraform apply 후 `terraform output dns_records`로 확인해서 그대로 입력.

output "dkim_cname_records" {
  description = "DKIM 인증용 CNAME 3개 (name → value)"
  value = [
    for token in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : {
      type  = "CNAME"
      name  = "${token}._domainkey.${var.domain}"
      value = "${token}.dkim.amazonses.com"
    }
  ]
}

output "mail_from_mx_record" {
  description = "Custom MAIL FROM MX 레코드"
  value = {
    type     = "MX"
    name     = "mail.${var.domain}"
    value    = "feedback-smtp.${var.region}.amazonses.com"
    priority = 10
  }
}

output "mail_from_spf_txt" {
  description = "MAIL FROM SPF TXT 레코드"
  value = {
    type  = "TXT"
    name  = "mail.${var.domain}"
    value = "v=spf1 include:amazonses.com ~all"
  }
}

output "dmarc_txt_recommended" {
  description = "DMARC TXT (도달률/스팸 방지 권장). 안정화 후 p=none → quarantine 상향."
  value = {
    type  = "TXT"
    name  = "_dmarc.${var.domain}"
    value = "v=DMARC1; p=none; rua=mailto:${var.from_email}; fo=1"
  }
}

# ── 앱 env에 넣을 발송 자격증명 (민감) ────────────────────────────
output "ses_access_key_id" {
  description = "AWS_ACCESS_KEY_ID (Vercel env + GitHub Actions secret)"
  value       = aws_iam_access_key.ses_sender.id
}

output "ses_secret_access_key" {
  description = "AWS_SECRET_ACCESS_KEY — `terraform output -raw ses_secret_access_key`로 확인"
  value       = aws_iam_access_key.ses_sender.secret
  sensitive   = true
}
