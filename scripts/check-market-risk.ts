import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { evaluateMarketAssessmentSnapshot, getKisMarketAssessmentSnapshot } from '@/lib/market-data/kis-market-assessment';

// Read-only market diagnostic. Does not prepare/persist/send a newsletter or call an LLM.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
async function main() {
  const snapshot = await getKisMarketAssessmentSnapshot();
  const evidence = evaluateMarketAssessmentSnapshot(snapshot, new Date());
  const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ snapshot, evidence }, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify({
    fetchedAt: snapshot.fetchedAt, verdict: evidence.verdict, severity: evidence.verdict === 'CRASH_ALERT' ? evidence.severity : null,
    riskScore: evidence.crashScore, dataQuality: evidence.dataQuality, reasons: evidence.reasonCodes,
    signals: [...evidence.tier1Signals, ...evidence.tier2Signals], output: output ?? null,
  }, null, 2));
  if (evidence.verdict === 'UNAVAILABLE') process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
