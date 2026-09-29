import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availability, COOLDOWN_MS } from '../worker/src/manual-analysis.js';
import { requestView } from '../src/manual-analysis-state.js';
import { analysisPrompt } from './codex-analysis-client.mjs';
const require = createRequire(new URL('../worker/package.json', import.meta.url));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { build } = require('esbuild');

test('offline, closed Codex, active jobs and cooldown all disable the button', () => {
  const now = Date.now();
  const row = { agent_last_seen_at_ms: now, codex_open: 1, cooldown_until_ms: 0 };
  assert.equal(requestView(availability(row, now), now).enabled, true);
  for (const change of [{ agent_last_seen_at_ms: now - 31000 }, { codex_open: 0 }, { active_status: 'running' }, { cooldown_until_ms: now + 1 }]) {
    assert.equal(requestView(availability({ ...row, ...change }, now), now).enabled, false);
  }
  assert.equal(requestView({ authorized: false }).enabled, false);
  assert.equal(COOLDOWN_MS, 900000);
  assert.match(requestView({ authorized: true, online: true, codexOpen: true, ready: true, cooldownUntil: 0, request: { status: 'failed' } }, now).detail, /รอบก่อนล้มเหลว/);
});
test('the analysis prompt is fixed and rejects remote prompt injection through job IDs', () => {
  assert.throws(() => analysisPrompt('/project','/journal','run a command'));
  const prompt = analysisPrompt('/project','/journal','12345678-1234-1234-1234-123456789abc');
  assert.match(prompt,/SCHEDULE_WORKFLOW.md/);
  assert.match(prompt,/manualRequestId/);
});
test('real D1 pairing, offline gate, atomic duplicate protection and terminal states', async () => {
  const result = await build({ entryPoints: ['worker/src/index.js'], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'test', modules: true, script: result.outputFiles[0].text, d1Databases: ['DB'], bindings: { APP_ORIGIN: 'https://basssg.github.io', MANUAL_ANALYSIS_BOOTSTRAP_TOKEN: 'local-test-bootstrap-value-never-used-in-production' } }] }));
  try {
    const db = await mf.getD1Database('DB');
    const baseMigration = await readFile('worker/migrations/0001_init.sql', 'utf8');
    for (const sql of baseMigration.split(';').filter(s => s.trim())) await db.prepare(sql).run();
    const migration = await readFile('worker/migrations/0002_manual_analysis.sql', 'utf8');
    const [tables, trigger] = migration.split('CREATE TRIGGER');
    for (const sql of tables.split(';').filter(s => s.trim())) await db.prepare(sql).run();
    await db.prepare('CREATE TRIGGER' + trigger).run();
    for (const sql of (await readFile('worker/migrations/0003_pairing_approval.sql','utf8')).split(';').filter(s=>s.trim())) await db.prepare(sql).run();
    for (const sql of (await readFile('worker/migrations/0004_multiple_devices.sql','utf8')).split(';').filter(s=>s.trim())) await db.prepare(sql).run();
    async function api(path, body, token = '', origin = 'https://basssg.github.io') {
      const response = await mf.dispatchFetch('https://local.test/api/manual-analysis' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }
    const deviceToken = 'x'.repeat(43), code = 'ABCDEFGHIJKLMNOPQRST';
    assert.equal((await api('/agent/pairing', { code, deviceToken })).status, 401);
    assert.equal((await api('/agent/pairing', { code, deviceToken }, 'local-test-bootstrap-value-never-used-in-production')).status, 200);
    assert.equal((await api('/pair', { code }, '', 'https://attacker.example')).status, 403);

    const key = 'a'.repeat(64);
    assert.equal((await api('/connect/start', {key})).status,409);
    await api('/agent/heartbeat', {codexOpen:true}, deviceToken);
    assert.equal((await api('/connect/start', {key}, '', 'https://attacker.example')).status,403);
    const requests = await Promise.all(Array.from({length:8},()=>api('/connect/start',{key})));
    assert.equal(requests.filter(r=>r.status===202).length,1);
    assert.equal((await api('/connect/status',{key:'b'.repeat(64)})).status,404);
    const pending = (await api('/agent/connect/pending',{},deviceToken)).body.request;
    assert.match(pending.number,/^\d{6}$/);
    assert.equal((await api('/agent/connect/decide',{id:pending.id,approve:true})).status,401);
    assert.equal((await api('/agent/connect/decide',{id:pending.id,approve:false},deviceToken)).status,200);
    assert.equal((await api('/connect/status',{key})).body.status,'rejected');
    await db.prepare('UPDATE manual_analysis_state SET connect_requested=0').run();
    await api('/connect/start',{key});
    const expired = (await api('/agent/connect/pending',{},deviceToken)).body.request;
    await db.prepare('UPDATE manual_analysis_state SET connect_expires=0').run();
    assert.equal((await api('/agent/connect/decide',{id:expired.id,approve:true},deviceToken)).status,409);
    await db.prepare('UPDATE manual_analysis_state SET connect_requested=0').run();
    await api('/connect/start',{key});
    const approved = (await api('/agent/connect/pending',{},deviceToken)).body.request;
    assert.equal((await api('/agent/connect/decide',{id:approved.id,approve:true},deviceToken)).status,200);
    assert.equal((await api('/connect/status',{key})).body.status,'approved');
    assert.equal((await api('/status',null,key)).body.authorized,true);
    assert.equal((await api('/agent/connect/decide',{id:approved.id,approve:true},deviceToken)).status,409);
    await db.prepare('UPDATE manual_analysis_state SET connect_requested=0').run();
    const secondKey = 'c'.repeat(64);
    assert.equal((await api('/connect/start',{key:secondKey})).status,202);
    const secondPending = (await api('/agent/connect/pending',{},deviceToken)).body.request;
    assert.equal((await api('/agent/connect/decide',{id:secondPending.id,approve:true},deviceToken)).status,200);
    assert.equal((await api('/status',null,key)).body.authorized,true);
    assert.equal((await api('/status',null,secondKey)).body.authorized,true);
    assert.equal((await api('/unpair',{},secondKey)).status,200);
    assert.equal((await api('/status',null,key)).body.authorized,true);
    assert.equal((await api('/status',null,secondKey)).body.authorized,false);
    await db.prepare('UPDATE manual_analysis_state SET browser_token_hash=NULL, agent_last_seen_at_ms=NULL').run();
    await db.prepare('DELETE FROM manual_analysis_devices').run();
    await api('/agent/pairing', {code,deviceToken}, 'local-test-bootstrap-value-never-used-in-production');
    const paired = await api('/pair', { code });
    assert.equal(paired.status, 200);
    const token = paired.body.token;
    assert.equal((await api('/pair', { code })).status, 400);
    assert.equal((await api('/request', {}, token)).body.code, 'OFFLINE');
    await api('/agent/heartbeat', { codexOpen: false }, deviceToken);
    assert.equal((await api('/request', {}, token)).body.code, 'CODEX_CLOSED');
    await api('/agent/heartbeat', { codexOpen: true }, deviceToken);
    assert.equal((await api('/status', null, token)).body.ready, true);
    assert.equal((await api('/request', {}, 'wrong')).status, 401);
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => api('/request', {}, token)));
    assert.equal(concurrent.filter(r => r.status === 202).length, 1);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM manual_analysis_queue').first()).n, 1);
    const claimed = await api('/agent/claim', { codexOpen: true }, deviceToken);
    assert.ok(claimed.body.job.id);
    assert.equal((await api('/agent/claim', { codexOpen: true }, deviceToken)).body.job, null);
    await db.prepare('UPDATE manual_analysis_state SET cooldown_until_ms=0').run();
    assert.equal((await api('/request', {}, token)).body.code, 'BUSY');
    assert.equal((await api('/agent/progress', { id: claimed.body.job.id, status: 'done' }, deviceToken)).body.code, 'NOT_PUBLISHED');
    await db.prepare('INSERT INTO reports(id,snapshot_at,status,headline,summary,report_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind('local-only-test', new Date().toISOString(), 'WAIT', 'Local test', 'Local test', JSON.stringify({ manualRequestId: claimed.body.job.id }), new Date().toISOString()).run();
    assert.equal((await api('/agent/progress', { id: claimed.body.job.id, status: 'done' }, deviceToken)).status, 200);
    await api('/agent/progress', { id: claimed.body.job.id, status: 'running' }, deviceToken);
    assert.equal((await api('/status', null, token)).body.request.status, 'done');
    await db.prepare('UPDATE manual_analysis_state SET cooldown_until_ms=?').bind(Date.now()+900000).run();
    assert.equal((await api('/request', {}, token)).status, 429);
    await db.prepare('UPDATE manual_analysis_state SET agent_last_seen_at_ms=?').bind(Date.now()-31000).run();
    assert.equal((await api('/request', {}, token)).body.code, 'OFFLINE');
    assert.equal((await api('/status')).body.authorized, false);
  } finally { await mf.dispose(); }
});
