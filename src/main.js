import "./style.css";

const BASE_URL = import.meta.env.BASE_URL;
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const byId = (id) => document.getElementById(id);
let currentReport = null;
let toastTimer = 0;
let installPrompt = null;
let historyReports = [];
let historyTotal = null;
let historyCursor = null;
let historyHasMore = false;
let historyLoading = false;
const HISTORY_PAGE_SIZE = 30;

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3600);
}

function formatDate(value) {
  if (!value) return "กำลังรอรายงาน";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  }).format(date);
}

function textValue(value, fallback = "—") {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(" · ") || fallback;
  return String(value ?? "").trim() || fallback;
}

function freshnessLabel(report) {
  const age = Date.now() - Date.parse(report.snapshotAt);
  if (!Number.isFinite(age) || age < -300000) return { text: "เวลาข้อมูลไม่ชัดเจน", type: "warning" };
  const quality = String(report.dataQuality?.status || "").toUpperCase();
  if (quality === "UNAVAILABLE") return { text: "ข้อมูลราคาหลักไม่พร้อม", type: "warning" };
  if (age >= 24 * 60 * 60 * 1000) return { text: "รายงานย้อนหลัง · ตรวจราคาใหม่", type: "warning" };
  if (quality === "PARTIAL") return { text: "ข้อมูลบางส่วนไม่ครบ", type: "warning" };
  if (age >= 4 * 60 * 60 * 1000) return { text: "ควรตรวจราคาใหม่", type: "warning" };
  return { text: "รายงานรอบล่าสุด", type: "current" };
}

function renderSources(container, sources) {
  const list = Array.isArray(sources) ? sources : (sources ? [sources] : []);
  const nodes = list.map((source) => {
    const label = typeof source === "string" ? source : (source.name || source.url || "แหล่งข้อมูล");
    const url = safeWebUrl(typeof source === "string" ? source : source.url);
    const node = document.createElement(url ? "a" : "span");
    node.textContent = label;
    if (url) { node.href = url; node.target = "_blank"; node.rel = "noreferrer"; }
    return node;
  });
  container.replaceChildren(...nodes);
}

function renderNews(report) {
  const events = Array.isArray(report.newsEvents) ? report.newsEvents.slice(0, 5) : [];
  const hasNews = Boolean(report.newsRisk || events.length || report.contextSignals);
  byId("news-empty").hidden = hasNews;
  byId("news-content").hidden = !hasNews;
  if (!hasNews) return;
  byId("news-risk").textContent = report.newsRisk || "ตรวจข่าวก่อนใช้แผน";
  byId("news-context").textContent = report.contextSignals || "";
  byId("news-context").hidden = !report.contextSignals;
  const cards = events.map((event) => {
    const card = document.createElement("article");
    card.className = "news-event";
    const head = document.createElement("div");
    head.className = "news-event-head";
    const title = document.createElement("strong");
    title.textContent = textValue(event.title, "ข่าว USD");
    const state = document.createElement("span");
    const announced = event.state === "RELEASED";
    state.className = "news-state " + (announced ? "released" : "upcoming");
    state.textContent = announced ? "ประกาศแล้ว" : event.state === "UNVERIFIED" ? "รอยืนยัน" : "รอประกาศ";
    head.append(title, state);
    const detail = document.createElement("p");
    const time = event.at ? formatDate(event.at) : "ยังไม่ยืนยันเวลา";
    const figures = announced ? [event.actual && "จริง " + event.actual, event.forecast && "คาด " + event.forecast, event.previous && "ก่อน " + event.previous].filter(Boolean).join(" · ") : "";
    detail.textContent = [time, figures, event.impact].filter(Boolean).join("\n");
    card.append(head, detail);
    const linkUrl = safeWebUrl(event.sourceUrl);
    if (linkUrl) {
      const link = document.createElement("a");
      link.href = linkUrl; link.target = "_blank"; link.rel = "noreferrer";
      link.textContent = "ดูต้นทาง ↗";
      card.append(link);
    }
    return card;
  });
  byId("news-list").replaceChildren(...cards);
}

function normalizeStatus(status) {
  const value = String(status || "WAIT").toUpperCase();
  if (value.includes("BUY") || value.includes("ซื้อ")) return { label: "WATCH BUY", className: "buy" };
  if (value.includes("SELL") || value.includes("ขาย")) return { label: "WATCH SELL", className: "sell" };
  return { label: "WAIT", className: "neutral" };
}

function renderReport(report) {
  if (!report || !report.snapshotAt) return false;
  currentReport = report;
  byId("report-empty").hidden = true;
  byId("report-content").hidden = false;
  const status = normalizeStatus(report.status || report.bias);
  byId("bias-pill").textContent = status.label;
  byId("bias-pill").className = "bias-pill " + status.className;
  byId("analysis").classList.remove("status-neutral", "status-buy", "status-sell");
  byId("analysis").classList.add("status-" + status.className);
  byId("report-title").textContent = report.headline || "รายงาน XAU/USD";
  byId("report-summary").textContent = report.summary || "";
  byId("report-bias").textContent = report.bias || report.status || "WAIT";
  byId("report-entry").textContent = report.entryZone || report.entry || "ยังไม่มีโซนเข้า";
  byId("report-trigger").textContent = report.trigger || "รอแท่งปิดยืนยัน";
  byId("report-invalidation").textContent = report.invalidation || report.stop || "ดูบทวิเคราะห์เต็ม";
  byId("report-stop").textContent = report.stop || "ดูบทวิเคราะห์เต็ม";
  byId("report-targets").textContent = textValue(report.targets, "รอระบุเป้าหมาย");
  byId("report-rr").textContent = report.riskReward || "";
  const freshness = freshnessLabel(report);
  byId("report-freshness").textContent = freshness.text;
  byId("report-freshness").className = "freshness-badge " + freshness.type;
  byId("report-plan-state").hidden = !report.planState;
  byId("report-plan-state").textContent = textValue(report.planState, "");
  byId("report-plan-state").title = report.planId || "";
  byId("report-validity").hidden = !report.validUntil;
  byId("report-validity").textContent = report.validUntil ? "ใช้ได้ถึง: " + (/^\d{4}-/.test(report.validUntil) ? formatDate(report.validUntil) : report.validUntil) : "";
  byId("report-change-card").hidden = !report.changeSinceLast;
  byId("report-change").textContent = textValue(report.changeSinceLast);
  byId("report-wait-card").hidden = !report.waitFor;
  byId("report-wait").textContent = textValue(report.waitFor);
  byId("prior-review-card").hidden = !report.priorReview;
  byId("prior-review-outcome").textContent = report.priorReview ? textValue(report.priorReview.outcome) : "";
  byId("prior-review-evidence").textContent = report.priorReview ? textValue(report.priorReview.evidence, "") : "";
  byId("weekly-review-card").hidden = !report.weeklyReview;
  byId("weekly-review-summary").textContent = report.weeklyReview ? textValue(report.weeklyReview.summary) : "";
  byId("weekly-review-lesson").textContent = report.weeklyReview ? textValue(report.weeklyReview.lesson, "") : "";
  renderAnalysisBody(report.body || report.analysis || "");
  renderNews(report);
  renderSources(byId("report-sources"), report.sources);
  byId("snapshot-time").textContent = formatDate(report.snapshotAt);
  byId("snapshot-source").textContent = report.dataQuality?.detail || "เวลาและแหล่งข้อมูลอยู่ในรายงานฉบับเต็ม";
  const imageUrl = report.imageUrl || (report.image ? (BASE_URL + "reports/latest.png") : "");
  const imageLink = byId("report-image-link");
  if (imageUrl) {
    byId("report-image").src = imageUrl;
    imageLink.href = imageUrl;
    imageLink.hidden = false;
  } else {
    imageLink.hidden = true;
  }
  return true;
}

const ANALYSIS_SECTIONS = [
  { pattern: /^XAU\/USD\s*[—:]/i, title: "ภาพรวม", style: "overview" },
  { pattern: /^(?:ข้อมูลจริง|ภาพหลายกรอบเวลา)/, title: "ภาพราคา", style: "timeframes" },
  { pattern: /^(?:แผนหลัก|แผนขาย|แผนซื้อ)/, title: "แผนหลัก", style: "trade-plan" },
  { pattern: /^(?:เปลี่ยนมุมมอง|ยกเลิก|เงื่อนไขยกเลิก)/, title: "เงื่อนไขยกเลิก", style: "invalidation" },
  { pattern: /^(?:ข่าว|ปฏิทิน|ความเสี่ยงก่อนข่าว)/, title: "ข่าวและความเสี่ยง", style: "news-context" },
  { pattern: /^(?:บริบท|DXY)/, title: "บริบทเพิ่มเติม", style: "context" },
  { pattern: /^(?:ทบทวน|ผลตรวจ)/, title: "ทบทวนแผนก่อน", style: "review" },
  { pattern: /^ข้อสรุป/, title: "ข้อสรุป", style: "conclusion" }
];

function analysisBlocks(value) {
  return String(value || "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const section = ANALYSIS_SECTIONS.find(({ pattern }) => pattern.test(block));
    if (!section) return { title: "รายละเอียด", style: "detail", text: block };
    const explicitHeading = block.match(/^(?:ภาพหลายกรอบเวลา|แผนหลัก|ข่าวและปัจจัยพื้นฐาน|ข้อสรุป):\s*([\s\S]*)$/);
    const text = explicitHeading ? explicitHeading[1].trim() : block;
    return {
      title: section.title,
      style: section.style,
      text: section.style === "trade-plan" ? text.replace(/^แผนหลัก\s*[—:–-]\s*/, "") : text
    };
  });
}

function renderAnalysisBody(value) {
  const nodes = analysisBlocks(value).map((block) => {
    const section = document.createElement("section");
    section.className = "analysis-section " + block.style;
    const title = document.createElement("h4");
    title.textContent = block.title;
    const paragraph = document.createElement("p");
    paragraph.textContent = block.text;
    section.append(title, paragraph);
    return section;
  });
  byId("report-body").replaceChildren(...nodes);
}

function historyBody(value) {
  return analysisBlocks(value).map((block) =>
    '<section class="analysis-section ' + block.style + '"><h4>' + escapeHTML(block.title) +
    '</h4><p>' + escapeHTML(block.text) + '</p></section>'
  ).join("");
}

function safeWebUrl(value) {
  if (!value || !/^https?:\/\//i.test(String(value))) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function historyField(label, value) {
  return '<div class="history-plan-cell"><small>' + escapeHTML(label) + '</small><strong>' +
    escapeHTML(value || "—") + '</strong></div>';
}

function historySources(sources) {
  const list = Array.isArray(sources) ? sources : (sources ? [sources] : []);
  return list.map((source) => {
    const label = typeof source === "string" ? source : (source.name || source.url || "แหล่งข้อมูล");
    const url = safeWebUrl(typeof source === "string" ? source : source.url);
    return url ? '<a href="' + escapeHTML(url) + '" target="_blank" rel="noreferrer">' + escapeHTML(label) + '</a>' : '<span>' + escapeHTML(label) + '</span>';
  }).join(" · ");
}

function renderHistory() {
  const list = byId("history-list");
  byId("history-loading").hidden = !historyLoading;
  if (!historyReports.length) {
    list.innerHTML = '<div class="history-empty">รายงานที่เผยแพร่จะแสดงที่นี่</div>';
    byId("history-count").textContent = "0 รายงาน";
    byId("history-more").hidden = true;
    byId("history-more").disabled = historyLoading;
    return;
  }
  const count = historyTotal === null
    ? historyReports.length + " รายงาน"
    : historyReports.length + " จาก " + historyTotal + " รายงาน";
  byId("history-count").textContent = count;
  byId("history-more").hidden = !historyHasMore;
  byId("history-more").disabled = historyLoading;
  byId("history-loading").hidden = !historyLoading;
  list.innerHTML = historyReports.map((report) => {
    const status = normalizeStatus(report.status || report.bias);
    const title = report.headline || report.summary || "รายงาน XAU/USD";
    const summary = report.summary || "";
    const body = report.body || report.analysis || "";
    const sources = historySources(report.sources);
    const imageUrl = safeWebUrl(report.imageUrl);
    return '<details class="history-entry"><summary class="history-row">' +
      '<span class="history-time">' + escapeHTML(formatDate(report.snapshotAt)) + '</span>' +
      '<span class="history-tag ' + status.className + '">' + escapeHTML(status.label) + '</span>' +
      '<span class="history-summary">' + escapeHTML(title) + '</span>' +
      '<span class="history-arrow" aria-hidden="true">›</span></summary>' +
      '<div class="history-detail">' +
      (summary ? '<p class="history-detail-summary">' + escapeHTML(summary) + '</p>' : '') +
      '<div class="history-plan-grid">' +
      historyField("มุมมอง", report.bias || report.status) +
      historyField("โซนที่เฝ้า", report.entryZone || report.entry) +
      historyField("เงื่อนไขยืนยัน", report.trigger) +
      historyField("จุดยกเลิกแผน", report.invalidation || report.stop) +
      historyField("Stop ตามโครงสร้าง", report.stop) +
      historyField("เป้าหมาย / R:R", textValue(report.targets) + (report.riskReward ? " · " + report.riskReward : "")) +
      '</div>' +
      (report.changeSinceLast ? '<p class="history-change"><strong>เปลี่ยนจากรอบก่อน: </strong>' + escapeHTML(report.changeSinceLast) + '</p>' : '') +
      (body ? '<div class="history-body">' + historyBody(body) + '</div>' : '') +
      (imageUrl ? '<a class="history-image-link" href="' + escapeHTML(imageUrl) + '" target="_blank" rel="noreferrer"><img loading="lazy" src="' + escapeHTML(imageUrl) + '" alt="ภาพสรุปแผน XAU/USD" /><span>เปิดภาพสรุป ↗</span></a>' : '') +
      (sources ? '<div class="history-sources"><strong>แหล่งข้อมูล</strong> ' + sources + '</div>' : '') +
      '</div></details>';
  }).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function loadReports() {
  let workerOnline = false;
  if (API_BASE) {
    const [latestResult, historyResult] = await Promise.allSettled([
      fetch(API_BASE + "/api/reports/latest", { cache: "no-store" }),
      refreshHistory()
    ]);
    if (latestResult.status === "fulfilled" && latestResult.value.ok) {
      try {
        const payload = await latestResult.value.json();
        workerOnline = true;
        if (payload.report) renderReport(payload.report);
      } catch {
        // The archive and existing report remain available if the latest payload is malformed.
      }
    }
    if (historyResult.status === "fulfilled" && historyResult.value) workerOnline = true;
  }

  if (!currentReport) {
    try {
      const response = await fetch(BASE_URL + "reports/latest.json", { cache: "no-store" });
      if (response.ok) {
        const report = await response.json();
        if (renderReport(report)) workerOnline = workerOnline || Boolean(API_BASE);
      }
    } catch {
      // The report panel keeps its clear first-run state.
    }
  }

  const label = byId("connection-label");
  label.textContent = workerOnline ? "เชื่อมต่อแล้ว" : (API_BASE ? "เชื่อมต่อไม่ได้" : "โหมดดูรายงานในเครื่อง");
  label.style.color = workerOnline ? "#70d49f" : "#d9b56a";
}

function updateHistoryFromPayload(payload, append) {
  const incoming = Array.isArray(payload.reports) ? payload.reports : [];
  if (append) {
    historyReports = uniqueReports(historyReports.concat(incoming));
    historyCursor = payload.nextCursor || null;
    historyHasMore = Boolean(payload.hasMore && historyCursor);
  } else if (historyReports.length) {
    const previouslyHadMore = historyHasMore;
    const previousCursor = historyCursor;
    historyReports = uniqueReports(incoming.concat(historyReports));
    historyCursor = previouslyHadMore ? previousCursor : null;
    historyHasMore = previouslyHadMore && Boolean(previousCursor);
  } else {
    historyReports = uniqueReports(incoming);
    historyCursor = payload.nextCursor || null;
    historyHasMore = Boolean(payload.hasMore && historyCursor);
  }
  const total = Number(payload.total);
  historyTotal = Number.isFinite(total) ? total : null;
  renderHistory();
}

function uniqueReports(reports) {
  const seen = new Set();
  return reports.filter((report) => {
    const key = report.id || [report.snapshotAt, report.createdAt, report.headline].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function refreshHistory() {
  if (!API_BASE || historyLoading) return false;
  historyLoading = true;
  renderHistory();
  try {
    const query = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
    const response = await fetch(API_BASE + "/api/reports/history?" + query.toString(), { cache: "no-store" });
    if (!response.ok) return false;
    updateHistoryFromPayload(await response.json(), false);
    return true;
  } catch {
    return false;
  } finally {
    historyLoading = false;
    renderHistory();
  }
}

async function loadOlderHistory() {
  if (!API_BASE || !historyHasMore || !historyCursor || historyLoading) return;
  historyLoading = true;
  renderHistory();
  try {
    const query = new URLSearchParams({
      limit: String(HISTORY_PAGE_SIZE),
      beforeSnapshotAt: historyCursor.snapshotAt,
      beforeCreatedAt: historyCursor.createdAt,
      beforeId: historyCursor.id
    });
    const response = await fetch(API_BASE + "/api/reports/history?" + query.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error("The archive could not be loaded.");
    updateHistoryFromPayload(await response.json(), true);
  } catch (error) {
    showToast(error.message || "The archive could not be loaded.");
  } finally {
    historyLoading = false;
    renderHistory();
  }
}

function mountTradingView() {
  const frame = byId("tradingview-chart");
  frame.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:calc(100% - 30px);width:100%"></div><div class="tradingview-widget-copyright"></div></div>';
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.type = "text/javascript";
  script.textContent = JSON.stringify({
    autosize: true,
    symbol: "PEPPERSTONE:XAUUSD",
    interval: "15",
    timezone: "Asia/Bangkok",
    theme: "dark",
    style: "1",
    locale: "th",
    allow_symbol_change: false,
    calendar: false,
    support_host: "https://www.tradingview.com"
  });
  script.onerror = () => {
    frame.innerHTML = '<div class="chart-loading">โหลดกราฟไม่ได้ — <a href="https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD" target="_blank" rel="noreferrer">เปิดกราฟโดยตรง ↗</a></div>';
  };
  frame.querySelector(".tradingview-widget-container").appendChild(script);
}

function base64ToBytes(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

async function postJSON(path, payload) {
  if (!API_BASE) throw new Error("The notification backend is not configured yet.");
  const response = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed (" + response.status + ").");
  return body;
}

async function updateNotificationState() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    byId("subscribe-button").disabled = true;
    byId("notify-help").textContent = "This browser does not support web push notifications.";
    return;
  }
  let subscription = null;
  try {
    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.getSubscription();
  } catch {
    // The install or service-worker step has not completed.
  }
  const enabled = Boolean(subscription && Notification.permission === "granted");
  byId("notify-indicator").textContent = enabled ? "ON" : "OFF";
  byId("notify-indicator").classList.toggle("on", enabled);
  byId("subscribe-button").hidden = enabled;
  byId("test-button").disabled = !enabled;
  byId("unsubscribe-button").hidden = !enabled;
}

async function subscribeForPush() {
  if (!API_BASE) {
    showToast("Push service is not connected yet.");
    return;
  }
  if (isAppleMobile() && !isStandalone()) {
    showToast("Add XAU Desk to the Home Screen first, then open the installed app.");
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    showToast("This browser does not support web push.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      showToast(permission === "denied" ? "Notifications are blocked in browser settings." : "Notification permission was not granted.");
      return;
    }
    const keyResponse = await fetch(API_BASE + "/api/push/public-key", { cache: "no-store" });
    const keyPayload = await keyResponse.json();
    if (!keyResponse.ok || !keyPayload.publicKey) throw new Error(keyPayload.error || "Push configuration is unavailable.");
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(keyPayload.publicKey)
      });
    }
    await postJSON("/api/push/subscribe", { subscription: subscription.toJSON(), userAgent: navigator.userAgent });
    await updateNotificationState();
    showToast("This device is ready for XAU Desk alerts.");
  } catch (error) {
    showToast(error.message || "Could not enable notifications.");
  }
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

async function sendTestAlert() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) throw new Error("Enable notifications on this device first.");
    await postJSON("/api/push/test", { subscription: subscription.toJSON() });
    showToast("Test alert sent to this device.");
  } catch (error) {
    showToast(error.message || "Test alert could not be sent.");
  }
}

async function unsubscribePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await postJSON("/api/push/unsubscribe", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    await updateNotificationState();
    showToast("Notifications turned off for this device.");
  } catch (error) {
    showToast(error.message || "Could not turn notifications off.");
  }
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  byId("install-button").addEventListener("click", async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice && choice.outcome === "accepted") byId("install-button").hidden = true;
      return;
    }
    const guide = byId("install-help");
    guide.open = true;
    guide.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  window.addEventListener("appinstalled", () => {
    byId("install-button").hidden = true;
    showToast("XAU Desk was added to this device.");
  });
  if (isStandalone()) byId("install-button").hidden = true;
}

function setupNav() {
  const links = Array.from(document.querySelectorAll(".nav-link, .mobile-nav-link"));
  links.forEach((link) => link.addEventListener("click", () => {
    links.forEach((item) => item.classList.toggle("selected", item.getAttribute("href") === link.getAttribute("href")));
  }));
}

function setupTextSize() {
  const sizes = ["normal", "large", "largest"];
  const labels = ["ปกติ", "ใหญ่", "ใหญ่มาก"];
  const button = byId("text-size-button");
  let saved = "normal";
  try { saved = localStorage.getItem("xau-desk-text-size") || "normal"; } catch { /* Storage may be disabled. */ }
  let index = Math.max(0, sizes.indexOf(saved));
  const apply = () => {
    document.documentElement.dataset.textSize = sizes[index];
    button.textContent = "ตัวอักษร: " + labels[index];
  };
  apply();
  button.addEventListener("click", () => {
    index = (index + 1) % sizes.length;
    apply();
    try { localStorage.setItem("xau-desk-text-size", sizes[index]); } catch { /* Storage may be disabled. */ }
  });
}

async function init() {
  mountTradingView();
  setupInstallPrompt();
  setupTextSize();
  setupNav();
  byId("subscribe-button").addEventListener("click", subscribeForPush);
  byId("test-button").addEventListener("click", sendTestAlert);
  byId("unsubscribe-button").addEventListener("click", unsubscribePush);
  byId("history-more").addEventListener("click", loadOlderHistory);
  await loadReports();
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(BASE_URL + "service-worker.js", { scope: BASE_URL });
      await updateNotificationState();
    } catch {
      byId("connection-label").textContent = "PWA worker unavailable";
    }
  }
  window.setInterval(loadReports, 120000);
}

init();
