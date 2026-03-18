/** Circuit Breaker + Rate Limiting + 메트릭 수집 */

// --- 인터페이스 ---

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

interface RateLimitState {
  requests: number[];
  lastRequest: number;
}

export interface ScrapingMetrics {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  browserFallbackCount: number;
  circuitBreakerTrips: number;
  averageResponseTime: number;
  domainStats: Record<string, {
    attempts: number;
    successes: number;
    failures: number;
    avgResponseTime: number;
  }>;
}

// --- 상수 ---

const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 3,
  TIMEOUT: 60000,
  HALF_OPEN_REQUESTS: 1,
};

const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 10,
  MIN_REQUEST_INTERVAL: 500,
};

// --- 글로벌 상태 ---

const circuitBreakers = new Map<string, CircuitBreakerState>();
const rateLimits = new Map<string, RateLimitState>();

export const metrics: ScrapingMetrics = {
  totalAttempts: 0,
  successCount: 0,
  failureCount: 0,
  browserFallbackCount: 0,
  circuitBreakerTrips: 0,
  averageResponseTime: 0,
  domainStats: {},
};

// --- Circuit Breaker ---

function getCircuitBreaker(domain: string): CircuitBreakerState {
  if (!circuitBreakers.has(domain)) {
    circuitBreakers.set(domain, { failures: 0, lastFailure: 0, state: 'closed' });
  }
  return circuitBreakers.get(domain)!;
}

export function canAttemptRequest(domain: string): boolean {
  const breaker = getCircuitBreaker(domain);
  const now = Date.now();

  if (breaker.state === 'closed') return true;

  if (breaker.state === 'open') {
    if (now - breaker.lastFailure > CIRCUIT_BREAKER_CONFIG.TIMEOUT) {
      breaker.state = 'half-open';
      return true;
    }
    return false;
  }

  return true; // half-open
}

export function recordSuccess(domain: string): void {
  const breaker = getCircuitBreaker(domain);
  breaker.failures = 0;
  breaker.state = 'closed';
}

export function recordFailure(domain: string): void {
  const breaker = getCircuitBreaker(domain);
  breaker.failures++;
  breaker.lastFailure = Date.now();

  if (breaker.failures >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
    breaker.state = 'open';
    metrics.circuitBreakerTrips++;
    console.warn(`[CircuitBreaker] OPEN for ${domain} (${breaker.failures} failures)`);
  }
}

// --- Rate Limiting ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enforceRateLimit(domain: string): Promise<void> {
  if (!rateLimits.has(domain)) {
    rateLimits.set(domain, { requests: [], lastRequest: 0 });
  }

  const state = rateLimits.get(domain)!;
  const now = Date.now();

  // 1분 이상 된 요청 제거
  state.requests = state.requests.filter(t => now - t < 60000);

  if (state.requests.length >= RATE_LIMIT_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    const oldestRequest = state.requests[0];
    const waitTime = 60000 - (now - oldestRequest);
    if (waitTime > 0) {
        await sleep(waitTime);
    }
  }

  const timeSinceLastRequest = now - state.lastRequest;
  if (timeSinceLastRequest < RATE_LIMIT_CONFIG.MIN_REQUEST_INTERVAL) {
    await sleep(RATE_LIMIT_CONFIG.MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }

  // 실제 요청 시점 기록 (sleep 이후)
  state.requests.push(Date.now());
  state.lastRequest = Date.now();
}

// --- 메트릭 ---

export function updateMetrics(domain: string, success: boolean, responseTime: number): void {
  metrics.totalAttempts++;

  if (success) {
    metrics.successCount++;
  } else {
    metrics.failureCount++;
  }

  const totalResponseTime = metrics.averageResponseTime * (metrics.totalAttempts - 1) + responseTime;
  metrics.averageResponseTime = totalResponseTime / metrics.totalAttempts;

  if (!metrics.domainStats[domain]) {
    metrics.domainStats[domain] = { attempts: 0, successes: 0, failures: 0, avgResponseTime: 0 };
  }

  const ds = metrics.domainStats[domain];
  ds.attempts++;
  if (success) ds.successes++;
  else ds.failures++;

  const totalDomainTime = ds.avgResponseTime * (ds.attempts - 1) + responseTime;
  ds.avgResponseTime = totalDomainTime / ds.attempts;
}

export function getMetrics(): ScrapingMetrics {
  return { ...metrics };
}

export function resetMetrics(): void {
  metrics.totalAttempts = 0;
  metrics.successCount = 0;
  metrics.failureCount = 0;
  metrics.browserFallbackCount = 0;
  metrics.circuitBreakerTrips = 0;
  metrics.averageResponseTime = 0;
  metrics.domainStats = {};
  circuitBreakers.clear();
  rateLimits.clear();
}
