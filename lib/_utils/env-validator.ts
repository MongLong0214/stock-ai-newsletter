/**
 * 환경 변수 검증 유틸리티
 * 프로덕션 배포 전 필수 환경 변수 확인
 */

interface EnvConfig {
  KIS_APP_KEY: string;
  KIS_APP_SECRET: string;
  KIS_BASE_URL: string;
}

class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * KIS API 환경 변수 검증
 */
export function validateKisEnv(): EnvConfig {
  const requiredVars = {
    KIS_APP_KEY: process.env.KIS_APP_KEY,
    KIS_APP_SECRET: process.env.KIS_APP_SECRET,
    KIS_BASE_URL: process.env.KIS_BASE_URL,
  };

  const missing: string[] = [];
  const invalid: string[] = [];

  // 필수 변수 존재 여부 확인
  Object.entries(requiredVars).forEach(([key, value]) => {
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    throw new EnvValidationError(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env.local file and ensure all KIS API credentials are set.'
    );
  }

  // APP_KEY 형식 검증 (영숫자 조합)
  if (requiredVars.KIS_APP_KEY && !/^[A-Za-z0-9]+$/.test(requiredVars.KIS_APP_KEY)) {
    invalid.push('KIS_APP_KEY: Invalid format (expected alphanumeric)');
  }

  // APP_SECRET 형식 검증 (Base64 형식)
  if (requiredVars.KIS_APP_SECRET && !/^[A-Za-z0-9+/=]+$/.test(requiredVars.KIS_APP_SECRET)) {
    invalid.push('KIS_APP_SECRET: Invalid format (expected base64)');
  }

  // BASE_URL 형식 검증
  if (requiredVars.KIS_BASE_URL) {
    try {
      const url = new URL(requiredVars.KIS_BASE_URL);
      if (!url.protocol.startsWith('https')) {
        invalid.push('KIS_BASE_URL: Must use HTTPS protocol');
      }
    } catch {
      invalid.push('KIS_BASE_URL: Invalid URL format');
    }
  }

  if (invalid.length > 0) {
    throw new EnvValidationError(
      `Invalid environment variable format:\n${invalid.join('\n')}`
    );
  }

  return requiredVars as EnvConfig;
}

/**
 * 프로덕션 환경 검증
 */
export function validateProductionEnv(): void {
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv === 'production') {
    // 프로덕션에서는 반드시 HTTPS 사용
    const baseUrl = process.env.KIS_BASE_URL;
    if (baseUrl && !baseUrl.startsWith('https://')) {
      throw new EnvValidationError(
        'Production environment must use HTTPS for KIS_BASE_URL'
      );
    }

    // 프로덕션에서는 기본값 사용 금지
    if (
      process.env.KIS_APP_KEY === 'your_app_key_here' ||
      process.env.KIS_APP_SECRET === 'your_app_secret_here'
    ) {
      throw new EnvValidationError(
        'Production environment cannot use default placeholder values'
      );
    }
  }
}