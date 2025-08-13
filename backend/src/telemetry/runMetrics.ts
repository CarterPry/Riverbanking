export type RunKPIs = {
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  validator_pass: number;
  validator_fail: number;
  planned_tests: number;
  executed_tests: number;
  fallback_invocations: number;
  assets: { subs: number; forms: number; apis: number };
  per_asset_coverage: Record<string, number>;
};

export class RunMetrics {
  private k: RunKPIs = {
    startedAt: new Date().toISOString(),
    validator_pass: 0, validator_fail: 0,
    planned_tests: 0, executed_tests: 0, fallback_invocations: 0,
    assets: { subs: 0, forms: 0, apis: 0 },
    per_asset_coverage: {}
  };

  setAssets(subs: number, forms: number, apis: number) { this.k.assets = { subs, forms, apis }; }
  setPlanned(n: number) { this.k.planned_tests = n; }
  incrementExecuted(assetId?: string) {
    this.k.executed_tests++;
    if (assetId) this.k.per_asset_coverage[assetId] = (this.k.per_asset_coverage[assetId] || 0) + 1;
  }
  inc(name: keyof Pick<RunKPIs,'validator_pass'|'validator_fail'|'fallback_invocations'>) { (this.k[name] as number)++; }
  finalizeAndWrite(outPath: string) {
    this.k.finishedAt = new Date().toISOString();
    this.k.durationMs = new Date(this.k.finishedAt).getTime() - new Date(this.k.startedAt).getTime();
    const fs = require('fs'); const path = require('path');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(this.k, null, 2));
    return this.k;
  }
}


