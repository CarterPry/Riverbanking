import dotenv from 'dotenv';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { AIOrchestrator } from '../orchestration/aiOrchestrator.js';

// Load .env from repo root
const envPath = path.resolve(process.cwd(), '..', '.env');
dotenv.config({ path: envPath });

const logger = createLogger('DiagnosticToolsScenario');

async function ensureLocalKiterunnerImage(): Promise<void> {
  const { execSync } = await import('child_process');
  try {
    execSync('docker image inspect local/kiterunner:1.0.2 >/dev/null 2>&1', { stdio: 'ignore' });
    logger.info('local/kiterunner:1.0.2 image present');
    return;
  } catch {}
  logger.info('Building local/kiterunner:1.0.2');
  const dockerfile = [
    'FROM debian:stable-slim',
    'RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*',
    'ARG KR_URL=https://github.com/assetnote/kiterunner/releases/download/v1.0.2/kiterunner_1.0.2_linux_amd64.tar.gz',
    'RUN curl -L "$KR_URL" | tar xz -C /usr/local/bin',
    'ENTRYPOINT ["kr"]' 
  ].join('\n');
  execSync(`docker build -t local/kiterunner:1.0.2 - <<'EOF'\n${dockerfile}\nEOF`, { stdio: 'inherit', shell: '/bin/bash' });
}

export async function runDiagnosticTools() {
  logger.info('Starting diagnostic tools scenario');
  await ensureLocalKiterunnerImage();

  const orchestrator = new AIOrchestrator();

  const targets = {
    web: 'https://www.designarena.ai',
    api: 'https://api.designarena.ai',
    console: 'https://console.designarena.ai'
  };

  // Minimal workflow to trigger specific tools
  const run = async (tool: string, target: string, extra?: Record<string, any>) => {
    try {
      const engine: any = (orchestrator as any).executionEngine;
      const res = await engine.execute({
        tool,
        parameters: { target, ...(extra || {}) },
        workflowId: 'diagnostic-' + tool
      });
      logger.info(`Executed ${tool}`, { status: res.status, error: res.error });
      const firstOut = (res.output || '').split('\n').slice(0, 20).join('\n');
      console.log(`\n=== ${tool} (${target}) ===\n`);
      console.log(firstOut);
      return res.status === 'success';
    } catch (e: any) {
      logger.error(`Execution error for ${tool}`, { error: e?.message || String(e) });
      return false;
    }
  };

  // jwt_tool
  await run('jwt-analyzer', targets.api);

  // wafw00f
  await run('waf-detection', targets.web);

  // arjun
  await run('parameter-discovery', targets.console);

  // kiterunner via brute + RAFT api endpoints list
  const apiWordlist = '/seclists/Discovery/Web-Content/api/api-endpoints.txt';
  await run('api-discovery', targets.api, { wordlist: apiWordlist });
}

// Run if executed directly
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node CJS guard for direct execution without ESM module flag
if ((global as any).process?.argv?.[1] && __filename === process.argv[1]) {
  runDiagnosticTools()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}


