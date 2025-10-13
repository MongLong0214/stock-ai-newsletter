export class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private readonly threshold = 3;
  private readonly timeout = 60000;

  isOpen(): boolean {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailTime < this.timeout) {
        return true;
      }
      this.failures = 0;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();
  }
}