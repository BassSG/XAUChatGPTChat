import './manual-analysis.css';
const STORAGE = 'xau-desk-manual-access';
import { requestView } from './manual-analysis-state.js';

export function setupManualAnalysis({ apiBase, onPublished }) {
  const byId = id => document.getElementById(id);
  const button = byId('manual-analysis-button');
  let token = '', state = null, receivedAt = 0, serverOffset = 0, submitting = false, refreshing = false, lastDone = null;
  try { token = localStorage.getItem(STORAGE) || ''; } catch {}
  function render() {
    const stale = receivedAt && Date.now() - receivedAt > 30000;
    const view = requestView(stale ? { error: 'ข้อมูลการเชื่อมต่อหมดอายุ กำลังตรวจอีกครั้ง' } : state, Date.now() + serverOffset);
    button.disabled = !view.enabled || submitting;
    button.textContent = submitting ? 'กำลังส่งคำขอ…' : view.label;
    byId('manual-analysis-status').textContent = view.detail;
    byId('manual-analysis-card').dataset.state = view.enabled ? 'ready' : state?.busy ? 'busy' : 'offline';
    byId('manual-pair-form').hidden = Boolean(state?.authorized);
    byId('manual-unpair').hidden = !state?.authorized;
    byId('manual-connection-state').textContent = view.label;
    byId('manual-unpair').disabled = Boolean(state?.busy) || submitting;
  }
  async function call(path, body) {
    if (!apiBase) throw new Error('ระบบเชื่อมต่อคอมยังไม่ได้ตั้งค่า');
    const response = await fetch(apiBase + '/api/manual-analysis' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
    return result;
  }
  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
      state = await call('/status'); receivedAt = Date.now(); serverOffset = state.serverNow - receivedAt;
      if (state.request?.status === 'done' && state.request.id !== lastDone) { lastDone = state.request.id; onPublished?.(); }
    } catch { state = { error: 'ยังติดต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }; }
    finally { refreshing = false; render(); }
  }
  button.addEventListener('click', async () => {
    if (button.disabled || submitting) return;
    submitting = true; byId('manual-action-message').textContent = ''; render();
    try { state = await call('/request', {}); receivedAt = Date.now(); serverOffset = state.serverNow - receivedAt; }
    catch (e) { byId('manual-action-message').textContent = e.message; }
    finally { submitting = false; render(); await refresh(); }
  });
  byId('manual-pair-form').addEventListener('submit', async event => {
    event.preventDefault(); if (submitting) return;
    submitting = true; byId('manual-pair-submit').disabled = true;
    try {
      localStorage.setItem(STORAGE + '-check', '1'); localStorage.removeItem(STORAGE + '-check');
      const result = await call('/pair', { code: byId('manual-pair-code').value });
      token = result.token; localStorage.setItem(STORAGE, token); byId('manual-pair-code').value = '';
      byId('manual-pair-message').textContent = 'จับคู่แล้ว กลับหน้าแรกเพื่อกดวิเคราะห์ได้เมื่อ Codex พร้อม';
    } catch (e) { byId('manual-pair-message').textContent = e.message; }
    finally { submitting = false; byId('manual-pair-submit').disabled = false; await refresh(); }
  });
  byId('manual-unpair').addEventListener('click', async () => {
    if (submitting || state?.busy) return;
    submitting = true;
    try { await call('/unpair', {}); token = ''; localStorage.removeItem(STORAGE); byId('manual-pair-message').textContent = 'ยกเลิกการจับคู่แล้ว'; }
    catch (e) { byId('manual-pair-message').textContent = e.message; }
    finally { submitting = false; await refresh(); }
  });
  byId('manual-refresh').addEventListener('click', refresh);
  byId('manual-analysis-card').querySelector('a').addEventListener('click', () => { document.querySelector('.settings-details').open = true; });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  setInterval(refresh, 10000); setInterval(render, 1000); render(); refresh();
}
