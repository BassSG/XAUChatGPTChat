import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopOpen, CodexClient, runAnalysis } from './codex-analysis-client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(process.env.LOCALAPPDATA || process.env.HOME, 'XAU Desk');
const api = 'https://xauchatgptchat-api.bass1135.workers.dev';
const file = join(directory, 'connector.json');
const lock = join(directory, 'connector.lock');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let config, active, previousOpen = false, preflight = false, pairingExpiresAt = 0;
await mkdir(directory, { recursive: true });
try {
  const oldPid = Number(await readFile(lock, 'utf8'));
  try { process.kill(oldPid, 0); console.log('XAU Desk connector is already running.'); process.exit(0); } catch { await unlink(lock); }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
const guard = await open(lock, 'wx'); await guard.writeFile(String(process.pid)); await guard.close();
try { config = JSON.parse(await readFile(file, 'utf8')); } catch { config = {}; }
if (config.codexPath) process.env.XAU_CODEX_PATH = config.codexPath;
const save = () => writeFile(file, JSON.stringify(config), { mode: 0o600 });
async function apiCall(path, body, token = config.deviceToken) {
  const response = await fetch(api + '/api/manual-analysis' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const result = await response.json();
  if (!response.ok) { const e = new Error(result.code || 'API_ERROR'); e.status = response.status; throw e; }
  return result;
}
async function pair() {
  const bootstrap = (await readFile(join(directory, 'bootstrap.key'), 'utf8')).trim();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const code = [...randomBytes(20)].map(value => alphabet[value & 31]).join('');
  config.deviceToken ||= randomBytes(32).toString('base64url');
  const pairing = await apiCall('/agent/pairing', { code, deviceToken: config.deviceToken }, bootstrap);
  pairingExpiresAt = pairing.expiresAt;
  await save();
  const formatted = code.match(/.{4}/g).join('-');
  await writeFile(join(directory, 'pairing.md'), `# จับคู่ XAU Desk กับคอม\n\nเปิด XAU Desk บนโทรศัพท์หรือแอปที่ต้องการใช้กดวิเคราะห์ → ตั้งค่าแอป → เชื่อมต่อคอม แล้วกรอกรหัสนี้:\n\n**${formatted}**\n\nรหัสใช้ได้ครั้งเดียว หมดอายุ ${new Date(pairingExpiresAt).toLocaleTimeString('th-TH')} เมื่อหมดอายุ ตัวช่วยจะสร้างรหัสใหม่ในไฟล์นี้\n\nหลังจับคู่ เปิด Codex บนคอมไว้แล้วกด “วิเคราะห์ตอนนี้” ที่หน้าแรกได้\n`, { mode: 0o600 });
  await writeFile(join(directory, 'pairing.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>จับคู่ XAU Desk</title><style>body{background:#081014;color:#e9e4d6;font:20px/1.7 system-ui;max-width:640px;margin:60px auto;padding:24px}code{display:block;background:#17292e;border:1px solid #dbb568;border-radius:16px;padding:24px;font-size:28px;word-break:break-all}a{color:#efd298}</style><h1>จับคู่กับคอมเครื่องนี้</h1><p>เปิด XAU Desk บนอุปกรณ์ที่จะใช้กดวิเคราะห์ ไปที่ตั้งค่าแอป แล้วกรอกรหัสนี้ รหัสใช้ได้ครั้งเดียวภายใน 15 นาที</p><code>${formatted}</code><p><a href="https://basssg.github.io/XAUChatGPTChat/#notifications">เปิด XAU Desk →</a></p><p>หลังจับคู่แล้ว เปิด Codex บนคอมไว้จึงจะกดวิเคราะห์จากอุปกรณ์นั้นได้</p>`, { mode: 0o600 });
  console.log('Pairing instructions saved to the local XAU Desk folder. Open pairing.html on this PC.');
}
async function published(job) {
  try {
    const response = await fetch(api + '/api/reports/latest', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    const result = await response.json();
    return result.report?.manualRequestId === job.id && Date.parse(result.report.createdAt) >= job.requested_at_ms;
  } catch { return false; }
}
async function execute(job) {
  const controller = new AbortController();
  active = { controller, job };
  config.activeJob = job; await save();
  const timer = setTimeout(() => controller.abort(), 60 * 60_000);
  try {
    if (!await desktopOpen()) throw new Error('CODEX_CLOSED');
    await runAnalysis({ root, journal: join(root, '..', '..', 'outputs', 'XAUUSD_Trading_Desk_Journal.md'), jobId: job.id, signal: controller.signal,
      onStarted: async threadId => { config.activeJob.threadId = threadId; await save(); await apiCall('/agent/progress', { id: job.id, status: 'running' }); } });
  } catch { console.log('Analysis ended; checking whether publication succeeded.'); }
  finally { clearTimeout(timer); }
  let done = await published(job);
  for (let i = 0; !done && i < 12 && !controller.signal.aborted; i++) { await delay(10000); done = await published(job); }
  config.completion = { id: job.id, status: done ? 'done' : 'failed' }; await save();
  active = null;
}
let stopping = false;
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { stopping = true; active?.controller.abort(); });
try {
  try { await pair(); } catch (e) { if (e.message !== 'ALREADY_PAIRED') throw e; }
  console.log('XAU Desk connector running. No analysis is started until the paired device requests it.');
  while (!stopping) {
    try {
      if (config.completion) {
        await apiCall('/agent/progress', config.completion);
        delete config.completion; delete config.activeJob; await save();
      }
      const isOpen = await desktopOpen();
      if (!isOpen) { preflight = false; active?.controller.abort(); }
      if (isOpen && (!previousOpen || !preflight) && !active && !config.activeJob) {
        const client = new CodexClient();
        try { await client.initialize(); preflight = true; } finally { client.close(); }
      }
      previousOpen = isOpen;
      // A crash during a task requires review in Codex; never start that request twice.
      const ready = isOpen && preflight && (!config.activeJob || Boolean(active));
      const beat = await apiCall('/agent/heartbeat', { codexOpen: ready });
      if (beat.paired) {
        await unlink(join(directory, 'pairing.html')).catch(() => {});
        await unlink(join(directory, 'pairing.md')).catch(() => {});
      } else if (Date.now() > pairingExpiresAt - 30000) await pair();
      if (ready && beat.paired && !active && !config.activeJob) {
        const { job } = await apiCall('/agent/claim', { codexOpen: await desktopOpen() });
        if (job) execute(job).catch(() => { preflight = false; console.log('Connector task needs review in Codex.'); });
      }
    } catch (e) {
      if (e.status === 401 && !active && !config.activeJob) {
        delete config.deviceToken; await save();
        try { await pair(); } catch { console.log('Pairing setup is required on this PC.'); }
      } else console.log('Connection unavailable; requests remain disabled until a fresh check succeeds.');
    }
    await delay(10000);
  }
} catch { console.error('XAU Desk connector setup is incomplete. Run the local setup first.'); process.exitCode = 1; }
finally {
  active?.controller.abort();
  try { await apiCall('/agent/heartbeat', { codexOpen: false }); } catch {}
  await unlink(lock).catch(() => {});
}
