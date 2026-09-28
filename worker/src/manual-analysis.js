export const COOLDOWN_MS = 15 * 60_000;
export const HEARTBEAT_MS = 30_000;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const bearer = request => (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const readState = env => env.DB.prepare('SELECT * FROM manual_analysis_state WHERE id=1').first();
export function availability(row, now = Date.now()) {
  const online = Boolean(row?.agent_last_seen_at_ms && now - row.agent_last_seen_at_ms <= HEARTBEAT_MS);
  const busy = ['queued', 'running'].includes(row?.active_status);
  const cooldownUntil = Number(row?.cooldown_until_ms || 0);
  return { paired: true, authorized: true, online, codexOpen: online && row.codex_open === 1,
    ready: online && row.codex_open === 1 && !busy && now >= cooldownUntil,
    busy, cooldownUntil, serverNow: now,
    request: row?.active_request_id ? { id: row.active_request_id, status: row.active_status, message: row.active_message || '', updatedAt: row.active_updated_at_ms } : null };
}
async function authenticate(request, row, kind) {
  const token = bearer(request);
  return token.length >= 32 && await hash(token) === row?.[kind + '_token_hash'];
}
const error = (code, message, status = 400, extra = {}) => reply({ code, error: message, ...extra }, status);

export async function handleManualAnalysis(request, env) {
  const path = new URL(request.url).pathname.replace('/api/manual-analysis', '');
  const now = Date.now();
  if (!env.MANUAL_ANALYSIS_BOOTSTRAP_TOKEN) return error('NOT_CONFIGURED', 'ยังไม่ได้เชื่อมต่อระบบวิเคราะห์บนคอม', 503);
  if (request.method === 'GET' && path === '/status') {
    const row = await readState(env);
    if (!await authenticate(request, row, 'browser')) return reply({ authorized: false, ready: false, serverNow: now });
    return reply(availability(row, now));
  }
  if (request.method !== 'POST') return error('NOT_FOUND', 'ไม่พบคำสั่ง', 404);
  if (Number(request.headers.get('content-length') || 0) > 4096) return error('TOO_LARGE', 'คำขอใหญ่เกินไป', 413);
  const raw = await request.text();
  if (raw.length > 4096) return error('TOO_LARGE', 'คำขอใหญ่เกินไป', 413);
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return error('INVALID_JSON', 'รูปแบบคำขอไม่ถูกต้อง'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('INVALID_JSON', 'รูปแบบคำขอไม่ถูกต้อง');
  const row = await readState(env);

  if (path === '/agent/pairing') {
    if (await hash(bearer(request)) !== await hash(env.MANUAL_ANALYSIS_BOOTSTRAP_TOKEN)) return error('UNAUTHORIZED', 'ไม่มีสิทธิ์เชื่อมต่อคอม', 401);
    if (row?.browser_token_hash) return error('ALREADY_PAIRED', 'คอมจับคู่แล้ว', 409);
    const code = String(body.code || '').replace(/-/g, '').toUpperCase();
    if (!/^[A-Z2-7]{20}$/.test(code) || !/^[A-Za-z0-9_-]{43}$/.test(body.deviceToken || '')) return error('INVALID_PAIRING', 'รหัสจับคู่ไม่ถูกต้อง');
    const updated = await env.DB.prepare('UPDATE manual_analysis_state SET pairing_code_hash=?, pairing_expires_at_ms=?, device_token_hash=?, agent_last_seen_at_ms=NULL, codex_open=0 WHERE id=1 AND browser_token_hash IS NULL RETURNING id')
      .bind(await hash(code), now + COOLDOWN_MS, await hash(body.deviceToken)).first();
    return updated ? reply({ ok: true, expiresAt: now + COOLDOWN_MS }) : error('ALREADY_PAIRED', 'คอมจับคู่แล้ว', 409);
  }
  if (path === '/pair') {
    if (request.headers.get('Origin') !== env.APP_ORIGIN) return error('ORIGIN', 'ต้นทางไม่ถูกต้อง', 403);
    const code = String(body.code || '').replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z2-7]{20}$/.test(code)) return error('INVALID_PAIRING', 'กรอกรหัสจับคู่ 20 ตัวจากคอม');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const updated = await env.DB.prepare('UPDATE manual_analysis_state SET browser_token_hash=?, pairing_code_hash=NULL, pairing_expires_at_ms=NULL WHERE id=1 AND browser_token_hash IS NULL AND pairing_code_hash=? AND pairing_expires_at_ms>? RETURNING id')
      .bind(await hash(token), await hash(code), now).first();
    return updated ? reply({ ok: true, token }) : error('INVALID_PAIRING', 'รหัสไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว');
  }
  if (path.startsWith('/agent/')) {
    if (!await authenticate(request, row, 'device')) return error('UNAUTHORIZED', 'ตัวช่วยยังไม่ได้จับคู่', 401);
    if (path === '/agent/heartbeat') {
      await env.DB.prepare('UPDATE manual_analysis_state SET agent_last_seen_at_ms=?, codex_open=? WHERE id=1 AND device_token_hash=?')
        .bind(now, body.codexOpen === true ? 1 : 0, row.device_token_hash).run();
      return reply({ ok: true, paired: Boolean(row.browser_token_hash) });
    }
    if (path === '/agent/claim') {
      if (body.codexOpen !== true || !availability(row, now).codexOpen) return error('CODEX_CLOSED', 'ต้องเปิด Codex บนคอมก่อน', 409);
      const job = await env.DB.prepare("UPDATE manual_analysis_queue SET status='running', started_at_ms=?, updated_at_ms=?, message='Codex กำลังรับงาน' WHERE id=? AND status='queued' AND requested_at_ms>? RETURNING id, requested_at_ms")
        .bind(now, now, row.active_request_id || '', now - 120_000).first();
      if (job) await env.DB.prepare("UPDATE manual_analysis_state SET active_status='running', active_message='Codex กำลังรับงาน', active_updated_at_ms=? WHERE id=1 AND active_request_id=?").bind(now, job.id).run();
      else if (row.active_status === 'queued' && now - row.last_request_at_ms >= 120_000) {
        await env.DB.batch([
          env.DB.prepare("UPDATE manual_analysis_queue SET status='failed', message='คอมไม่ได้รับคำขอทันเวลา', updated_at_ms=? WHERE id=? AND status='queued'").bind(now, row.active_request_id),
          env.DB.prepare("UPDATE manual_analysis_state SET active_status='failed', active_message='คอมไม่ได้รับคำขอทันเวลา', active_updated_at_ms=? WHERE id=1 AND active_request_id=? AND active_status='queued'").bind(now, row.active_request_id)
        ]);
      }
      return reply({ job: job || null });
    }
    if (path === '/agent/progress') {
      if (!['running', 'done', 'failed', 'cancelled'].includes(body.status) || body.id !== row.active_request_id) return error('INVALID_JOB', 'คำขอไม่ตรงกับงานปัจจุบัน', 409);
      const messages = { running: 'กำลังวิเคราะห์และตรวจข้อมูล', done: 'เผยแพร่รายงานใหม่แล้ว', failed: 'งานไม่สำเร็จ โปรดตรวจใน Codex', cancelled: 'หยุดงานแล้ว' };
      // Only fixed messages cross the public API; agent logs and credentials stay on the PC.
      const message = messages[body.status];
      if (body.status === 'done') {
        const published = await env.DB.prepare("SELECT id FROM reports WHERE json_extract(report_json, '$.manualRequestId')=? AND created_at>=? LIMIT 1")
          .bind(body.id, new Date(row.last_request_at_ms).toISOString()).first();
        if (!published) return error('NOT_PUBLISHED', 'ยังไม่พบรายงานที่เผยแพร่สำหรับคำขอนี้', 409);
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE manual_analysis_queue SET status=?, message=?, updated_at_ms=? WHERE id=? AND (status IN ('queued','running') OR status=?)").bind(body.status, message, now, body.id, body.status),
        env.DB.prepare('UPDATE manual_analysis_state SET active_status=?, active_message=?, active_updated_at_ms=? WHERE id=1 AND active_request_id=? AND EXISTS (SELECT 1 FROM manual_analysis_queue WHERE id=? AND status=?)').bind(body.status, message, now, body.id, body.id, body.status)
      ]);
      return reply({ ok: true });
    }
    return error('NOT_FOUND', 'ไม่พบคำสั่ง', 404);
  }
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return error('ORIGIN', 'ต้นทางไม่ถูกต้อง', 403);
  if (!await authenticate(request, row, 'browser')) return error('UNAUTHORIZED', 'จับคู่อุปกรณ์นี้กับคอมก่อน', 401);
  if (path === '/unpair') {
    if (availability(row, now).busy) return error('BUSY', 'รอให้งานปัจจุบันจบก่อนยกเลิกการจับคู่', 409);
    const cleared = await env.DB.prepare("UPDATE manual_analysis_state SET browser_token_hash=NULL, device_token_hash=NULL, pairing_code_hash=NULL, pairing_expires_at_ms=NULL, agent_last_seen_at_ms=NULL, codex_open=0 WHERE id=1 AND browser_token_hash=? AND COALESCE(active_status,'') NOT IN ('queued','running') RETURNING id").bind(row.browser_token_hash).first();
    return cleared ? reply({ ok: true }) : error('BUSY', 'รอให้งานปัจจุบันจบก่อนยกเลิกการจับคู่', 409);
  }
  if (path === '/request') {
    const id = crypto.randomUUID();
    // One atomic gate update also enqueues through the SQL trigger. Parallel clicks cannot both win.
    const accepted = await env.DB.prepare("UPDATE manual_analysis_state SET active_request_id=?, active_status='queued', active_message='รอ Codex รับงาน', active_thread_id=NULL, active_updated_at_ms=?, last_request_at_ms=?, cooldown_until_ms=? WHERE id=1 AND browser_token_hash=? AND agent_last_seen_at_ms>=? AND codex_open=1 AND COALESCE(cooldown_until_ms,0)<=? AND COALESCE(active_status,'') NOT IN ('queued','running') RETURNING active_request_id")
      .bind(id, now, now, now + COOLDOWN_MS, row.browser_token_hash, now - HEARTBEAT_MS, now).first();
    if (accepted) return reply({ ok: true, requestId: id, ...(availability(await readState(env))) }, 202);
    const current = availability(await readState(env));
    if (!current.online) return error('OFFLINE', 'คอมยังไม่เชื่อมต่อ เปิด Codex และตัวช่วยบนคอมก่อน', 409, current);
    if (!current.codexOpen) return error('CODEX_CLOSED', 'ต้องเปิด Codex บนคอมก่อน', 409, current);
    if (current.busy) return error('BUSY', 'กำลังทำงานรอบก่อน กรุณารอให้เสร็จ', 409, current);
    return error('COOLDOWN', 'กดวิเคราะห์ได้หนึ่งครั้งทุก 15 นาที', 429, current);
  }
  return error('NOT_FOUND', 'ไม่พบคำสั่ง', 404);
}
