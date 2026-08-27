variable "domain" {
  description = "이메일 발송 도메인"
  type        = string
  default     = "stockmatrix.co.kr"
}

variable "region" {
  description = "SES 리전 (실제 프로비저닝: us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "SES/IAM 권한을 가진 AWS CLI 프로필 (S3 전용 default 아님)"
  type        = string
  default     = "default"
}

variable "from_email" {
  description = "발신 주소 (SES_FROM_EMAIL env와 반드시 일치). IAM 정책이 이 주소로만 발송 허용."
  type        = string
  default     = "noreply@stockmatrix.co.kr"
}
