import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
const exec = promisify(execFile);
export const MODEL = 'gpt-6-sol';
export const EFFORT = 'high';
function codexExecutable() {
  if (process.env.XAU_CODEX_PATH && existsSync(process.env.XAU_CODEX_PATH)) return process.env.XAU_CODEX_PATH;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const base = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    try {
      const candidates = readdirSync(base).map(name => join(base, name, 'codex.exe')).filter(existsSync).sort((a,b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      if (candidates[0]) return candidates[0];
    } catch {}
  }
  return 'codex';
}

export async function desktopOpen() {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', "[bool](@(Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count)"], { windowsHide: true, timeout: 5000 });
    return stdout.trim() === 'True';
  } catch { return false; }
}

export class CodexClient {
  constructor(executable = codexExecutable()) {
    this.pending = new Map(); this.listeners = new Set(); this.counter = 0;
    this.process = spawn(executable, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this.process.stdin.on('error', () => {});
    this.process.once('error', () => this.fail());
    this.process.once('exit', () => this.fail());
    createInterface({ input: this.process.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.id !== undefined && !msg.method) {
        const task = this.pending.get(msg.id);
        if (task) { clearTimeout(task.timer); this.pending.delete(msg.id); msg.error ? task.reject(new Error('CODEX_RPC_FAILED')) : task.resolve(msg.result); }
      } else if (msg.id !== undefined && msg.method) {
        // This connector never grants new permissions or answers on behalf of the user.
        this.send({ id: msg.id, error: { code: -32601, message: 'Interactive requests are not supported by this connector.' } });
      } else this.listeners.forEach(listener => listener(msg));
    });
  }
  fail() {
    this.dead = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CODEX_DISCONNECTED')); }
    this.pending.clear();
    this.listeners.forEach(listener => listener({ method: 'connector/disconnected' }));
  }
  send(msg) { if (!this.dead) this.process.stdin.write(JSON.stringify(msg) + '\n'); }
  call(method, params = {}, timeout = 30000) {
    if (this.dead) return Promise.reject(new Error('CODEX_DISCONNECTED'));
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CODEX_TIMEOUT')); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.call('initialize', { clientInfo: { name: 'xau_desk_connector', title: 'XAU Desk', version: '1.0.0' } });
    this.send({ method: 'initialized', params: {} });
    const account = await this.call('account/read', { refreshToken: false });
    if (account.requiresOpenaiAuth && !account.account) throw new Error('CODEX_LOGIN_REQUIRED');
    const result = await this.call('model/list', { includeHidden: true });
    const model = result.data?.find(item => item.model === MODEL || item.id === MODEL);
    if (!model?.supportedReasoningEfforts?.some(item => item.reasoningEffort === EFFORT)) throw new Error('MODEL_UNAVAILABLE');
  }
  close() { this.process.kill(); this.fail(); }
}

export function analysisPrompt(root, journal, jobId) {
  if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error('INVALID_JOB_ID');
  return `วิเคราะห์ XAU/USD ตอนนี้หนึ่งรอบ และเผยแพร่รายงานจริงบน XAU Desk ตาม SCHEDULE_WORKFLOW.md ในโฟลเดอร์โปรเจกต์นี้ อ่านไฟล์นั้นก่อนเริ่มและปฏิบัติตามทุกข้อ ใช้ข้อมูลสด PEPPERSTONE:XAUUSD เท่านั้น ตรวจข่าวและข้อมูลประกอบให้ครบตามที่เข้าถึงได้ อ่านและอัปเดตสมุดบันทึกที่ ${JSON.stringify(journal)} ก่อนเผยแพร่ ใช้สคริปต์ render-analysis-image.mjs และ publish-report.ps1 ใน scripts ของโปรเจกต์นี้ ตรวจภาพจริงก่อนเผยแพร่ รายงานยังต้องมีประโยชน์แม้ WAIT ห้ามสร้างราคาหรือแท่งเทียนที่ตรวจสอบไม่ได้ ห้ามส่งคำสั่งซื้อขายหรือเปลี่ยนเลย์เอาต์ TradingView ถาวร ห้ามเปลี่ยนเวลา โมเดล หรือการตั้งค่า automation ห้ามแก้โค้ดแอปในงานวิเคราะห์นี้\nเพิ่มฟิลด์ manualRequestId: ${JSON.stringify(jobId)} ใน JSON รายงานจริงรอบนี้เพื่อให้เว็บยืนยันว่าคำขอนี้เผยแพร่แล้ว ส่งข้อความไทยและภาพฉบับเต็มในคำตอบด้วย ถ้าเข้าถึงเครื่องมือหรือข้อมูลจริงไม่ได้ ให้แจ้งข้อจำกัดตามจริงและทำรายงาน WAIT พร้อมข้อมูลที่ยืนยันได้ตาม workflow ห้ามนำข้อมูลทดสอบไปเผยแพร่ โฟลเดอร์โปรเจกต์: ${JSON.stringify(root)}`;
}

export async function runAnalysis({ root, journal, jobId, signal, onStarted = () => {} }) {
  const client = new CodexClient();
  let threadId, turnId;
  try {
    await client.initialize();
    if (signal.aborted || !await desktopOpen()) throw new Error('CODEX_CLOSED');
    const started = await client.call('thread/start', { model: MODEL, cwd: root, approvalPolicy: 'never', sandbox: 'workspaceWrite' });
    threadId = started.thread.id;
    await onStarted(threadId);
    let finish;
    const completed = new Promise(resolve => { finish = resolve; });
    client.listeners.add(msg => {
      if (msg.method === 'turn/completed' && msg.params?.threadId === threadId) finish(msg.params.turn.status);
      if (msg.method === 'connector/disconnected') finish('failed');
    });
    const interrupt = () => {
      if (turnId) client.call('turn/interrupt', { threadId, turnId }).catch(() => {});
      finish('interrupted');
    };
    signal.addEventListener('abort', interrupt, { once: true });
    try {
      if (signal.aborted) throw new Error('CODEX_CLOSED');
      const response = await client.call('turn/start', { threadId, input: [{ type: 'text', text: analysisPrompt(root, journal, jobId) }], model: MODEL, effort: EFFORT,
        approvalPolicy: 'never', sandboxPolicy: { type: 'workspaceWrite', writableRoots: [root, join(root, '..', '..', 'outputs')], networkAccess: true } });
      turnId = response.turn.id;
      if (signal.aborted) interrupt();
      const result = await completed;
      if (result !== 'completed') throw new Error('ANALYSIS_INCOMPLETE');
      return { threadId };
    } finally { signal.removeEventListener('abort', interrupt); }
  } finally { client.close(); }
}
