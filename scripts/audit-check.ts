/**
 * CI-only audit guard.
 *
 * Runs `pnpm audit --prod --json` and exits non-zero if any critical or high
 * severity advisory is present for production dependencies.
 *
 * NOTE: intentionally excluded from `pnpm test` to keep local TDD cycles fast.
 * Invoke via `pnpm test:audit`.
 */

import { execSync } from 'node:child_process';

type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

interface Advisory {
  severity: Severity;
  module_name?: string;
  title?: string;
  url?: string;
}

interface AuditReport {
  advisories?: Record<string, Advisory>;
  metadata?: {
    vulnerabilities?: Partial<Record<Severity, number>>;
  };
}

function runAudit(): AuditReport {
  try {
    const output = execSync('pnpm audit --prod --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(output) as AuditReport;
  } catch (error) {
    // `pnpm audit` exits with non-zero when vulnerabilities exist; still parse stdout.
    const stdout = (error as { stdout?: Buffer | string }).stdout;
    if (stdout) {
      const raw = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
      return JSON.parse(raw) as AuditReport;
    }
    throw error;
  }
}

function countBySeverity(report: AuditReport): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
  };

  const metaCounts = report.metadata?.vulnerabilities;
  if (metaCounts) {
    for (const key of Object.keys(counts) as Severity[]) {
      const value = metaCounts[key];
      if (typeof value === 'number') {
        counts[key] = value;
      }
    }
    return counts;
  }

  const advisories = report.advisories ?? {};
  for (const advisory of Object.values(advisories)) {
    if (advisory.severity in counts) {
      counts[advisory.severity] += 1;
    }
  }
  return counts;
}

function main(): void {
  const report = runAudit();
  const counts = countBySeverity(report);

  const critical = counts.critical ?? 0;
  const high = counts.high ?? 0;

  const summary = `audit-check: critical=${critical} high=${high} moderate=${counts.moderate ?? 0} low=${counts.low ?? 0}`;
  console.log(summary);

  if (critical > 0 || high > 0) {
    const offenders = Object.values(report.advisories ?? {})
      .filter((a) => a.severity === 'critical' || a.severity === 'high')
      .map((a) => `  - [${a.severity}] ${a.module_name ?? '<unknown>'}: ${a.title ?? ''}`)
      .slice(0, 20);
    if (offenders.length > 0) {
      console.error('Offending advisories:');
      console.error(offenders.join('\n'));
    }
    console.error('audit-check FAILED: critical + high must be 0 for production deps.');
    process.exit(1);
  }

  console.log('audit-check PASSED: no critical/high advisories in production deps.');
}

main();
