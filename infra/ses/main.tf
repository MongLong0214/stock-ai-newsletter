terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

# ── SES 도메인 아이덴티티 + Easy DKIM ──────────────────────────────
# DKIM 토큰(3개)은 outputs의 dkim_cname_records로 노출 → hosting.co.kr DNS에 CNAME 추가.
resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# ── Custom MAIL FROM (SPF/DMARC 정렬 향상, 도달률↑) ───────────────
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity   = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain = "mail.${var.domain}"
  # DNS 미설정 상태로 발송이 죽지 않도록 기본 아마존 도메인으로 폴백
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# ── 바운스/컴플레인 추적용 configuration set (권장) ───────────────
resource "aws_sesv2_configuration_set" "newsletter" {
  configuration_set_name = "stockmatrix-newsletter"

  reputation_options {
    reputation_metrics_enabled = true
  }
  delivery_options {
    tls_policy = "REQUIRE"
  }
}

# ── 발송 전용 IAM 유저 (최소 권한) ────────────────────────────────
resource "aws_iam_user" "ses_sender" {
  name = "stockmatrix-ses-sender"
  tags = { app = "stockmatrix", purpose = "newsletter-email" }
}

resource "aws_iam_user_policy" "ses_send" {
  name = "ses-send-only"
  user = aws_iam_user.ses_sender.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
      Condition = {
        StringEquals = {
          "ses:FromAddress" = var.from_email
        }
      }
    }]
  })
}

resource "aws_iam_access_key" "ses_sender" {
  user = aws_iam_user.ses_sender.name
}
