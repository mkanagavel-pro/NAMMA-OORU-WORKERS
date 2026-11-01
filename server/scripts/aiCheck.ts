/**
 * `npm run ai:check` - step-by-step diagnosis of Gemini AI search.
 * Prints timings and the real error details. NEVER prints the API key.
 *
 *   1. configuration (.env)        2. SDK import
 *   3. DNS + HTTPS to Google (lists models your key can use)
 *   4. a real generateContent request through the same code the website uses
 */
import 'dotenv/config';
import dns from 'node:dns/promises';
import { AiSearchService, loadAiConfig, redactSecrets, describeError } from '../services/aiSearch';

const cfg = loadAiConfig();
const HOST = 'generativelanguage.googleapis.com';
const ok = (m: string) => console.log(`  [ OK ] ${m}`);
const bad = (m: string) => console.log(`  [FAIL] ${m}`);
const info = (m: string) => console.log(`         ${m}`);
let failed = false;

async function main() {
  console.log('\n1. Configuration');
  if (!cfg.apiKey) { bad('GEMINI_API_KEY is not set. Put GEMINI_API_KEY="..." in the .env file next to package.json (no spaces, quotes optional), then rerun.'); process.exit(1); }
  ok(`GEMINI_API_KEY present (${cfg.apiKey.length} characters; value not shown)`);
  if (!/^AIza/.test(cfg.apiKey)) info('note: Google API keys normally start with "AIza" - check you pasted the whole key without extra characters.');
  ok(`model=${cfg.model}  fallback=${cfg.fallbackModel || '(none)'}  timeout=${cfg.timeoutMs}ms  enabled=${cfg.enabled}`);
  for (const v of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
    if (process.env[v]) info(`${v} is set (${redactSecrets(process.env[v]!).replace(/\/\/[^@/]*@/, '//***@')}). Node's fetch ignores proxy variables unless configured, which can make requests hang.`);
  }

  console.log('\n2. SDK');
  try {
    const t = Date.now();
    await import('@google/genai');
    ok(`@google/genai loaded in ${Date.now() - t}ms`);
  } catch (e: any) { bad(`cannot load @google/genai: ${e?.message}. Run "npm install".`); process.exit(1); }

  console.log(`\n3. Network to ${HOST}`);
  try {
    const t = Date.now();
    const addrs = await dns.lookup(HOST, { all: true });
    ok(`DNS ok in ${Date.now() - t}ms: ${addrs.map((a) => a.address).join(', ')}`);
  } catch (e: any) { bad(`DNS lookup failed (${e?.code}): ${e?.message}`); failed = true; }
  let modelIds: string[] = [];
  try {
    const t = Date.now();
    const res = await fetch(`https://${HOST}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': cfg.apiKey }, signal: AbortSignal.timeout(15000) });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) {
      modelIds = (body.models ?? []).map((m: any) => String(m.name).replace(/^models\//, ''));
      ok(`HTTPS ok in ${Date.now() - t}ms - key accepted, ${modelIds.length} models visible`);
      const lite = modelIds.filter((m) => /flash-lite/.test(m));
      info(`Flash-Lite models your key can use: ${lite.join(', ') || '(none listed)'}`);
      if (modelIds.includes(cfg.model)) ok(`configured model "${cfg.model}" exists`);
      else { bad(`configured model "${cfg.model}" is NOT in the list. Set GEMINI_MODEL in .env to one of the Flash-Lite ids above.`); failed = true; }
    } else {
      bad(`Google answered HTTP ${res.status} ${body?.error?.status ?? ''}: ${redactSecrets(body?.error?.message ?? '', cfg.apiKey)}`);
      if (res.status === 400 || res.status === 403) info('The API key was rejected. Create a new key in Google AI Studio and update .env.');
      failed = true;
    }
  } catch (e: any) {
    const d = describeError(e, cfg.apiKey, 15000);
    bad(`${d.kind}: ${d.name}: ${d.message}${d.networkCode ? ` [${d.networkCode}]` : ''}`);
    info(d.hint);
    failed = true;
  }

  console.log('\n4. Real search request (same code path as the website)');
  const svc = new AiSearchService(cfg, { log: (m) => console.log('         ' + m) });
  const phrase = 'kitchen shelf fix pannanum';
  const t = Date.now();
  const r = await svc.resolve(phrase, 'ai-check');
  if (r.source === 'ai') {
    ok(`Gemini answered in ${Date.now() - t}ms -> categories=${JSON.stringify(r.categories)} keywords=${JSON.stringify(r.keywords)}`);
  } else {
    bad(`no Gemini answer (source=${r.source}, reason=${r.fallbackReason}). Details are printed above.`);
    failed = true;
  }
  console.log(failed ? '\nResult: PROBLEMS FOUND (see [FAIL] lines).' : '\nResult: Gemini AI search is working.');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('ai:check crashed:', redactSecrets(String(e?.stack ?? e), cfg.apiKey)); process.exit(1); });
