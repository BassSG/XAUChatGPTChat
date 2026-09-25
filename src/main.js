import "./style.css";

const BASE_URL = import.meta.env.BASE_URL;
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const byId = (id) => document.getElementById(id);
let currentReport = null;
let toastTimer = 0;
let installPrompt = null;

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3600);
}

function updateClock() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  byId("local-clock").textContent = formatter.format(now) + " ICT";
}

function formatDate(value) {
  if (!value) return "Awaiting first brief";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  }).format(date) + " ICT";
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
  byId("report-title").textContent = report.headline || "XAU/USD desk brief";
  byId("report-summary").textContent = report.summary || "";
  byId("report-bias").textContent = report.bias || report.status || "WAIT";
  byId("report-entry").textContent = report.entryZone || report.entry || "No active entry zone";
  byId("report-trigger").textContent = report.trigger || "Wait for a confirmed candle close";
  byId("report-invalidation").textContent = report.invalidation || report.stop || "See the full analysis";
  byId("report-body").textContent = report.body || report.analysis || "";
  const sources = Array.isArray(report.sources) ? report.sources.join(" · ") : (report.sources || "TradingView · Pepperstone");
  byId("report-sources").textContent = sources;
  byId("snapshot-time").textContent = formatDate(report.snapshotAt);
  byId("snapshot-source").textContent = report.priceSource || "Analysis source: Codex desk schedule · PEPPERSTONE:XAUUSD";
  const imageUrl = report.imageUrl || (report.image ? (BASE_URL + "reports/latest.png") : "");
  const imageLink = byId("report-image-link");
  if (imageUrl) {
    byId("report-image").src = imageUrl;
    imageLink.href = imageUrl;
    imageLink.hidden = false;
  } else {
    imageLink.hidden = true;
  }
  renderHistory([report]);
  return true;
}

function renderHistory(reports) {
  const list = byId("history-list");
  if (!Array.isArray(reports) || !reports.length) {
    list.innerHTML = '<div class="history-empty">Reports will be listed here after the first scheduled analysis.</div>';
    byId("history-count").textContent = "0 reports";
    return;
  }
  byId("history-count").textContent = reports.length + (reports.length === 1 ? " report" : " reports");
  list.innerHTML = reports.map((report) => {
    const status = normalizeStatus(report.status || report.bias);
    const title = report.headline || report.summary || "XAU/USD desk brief";
    return '<a class="history-row" href="#analysis">' +
      '<span class="history-time">' + escapeHTML(formatDate(report.snapshotAt)) + '</span>' +
      '<span class="history-tag ' + status.className + '">' + escapeHTML(status.label) + '</span>' +
      '<span class="history-summary">' + escapeHTML(title) + '</span>' +
      '<span class="history-arrow">›</span></a>';
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
    try {
      const [latestResponse, historyResponse] = await Promise.all([
        fetch(API_BASE + "/api/reports/latest", { cache: "no-store" }),
        fetch(API_BASE + "/api/reports/history?limit=12", { cache: "no-store" })
      ]);
      if (latestResponse.ok) {
        const payload = await latestResponse.json();
        workerOnline = true;
        if (payload.report) renderReport(payload.report);
      }
      if (historyResponse.ok) {
        const payload = await historyResponse.json();
        if (payload.reports && payload.reports.length) renderHistory(payload.reports);
      }
    } catch {
      workerOnline = false;
    }
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
  label.textContent = workerOnline ? "API connected" : (API_BASE ? "API unavailable" : "Backend setup required");
  label.style.color = workerOnline ? "#70d49f" : "#d9b56a";
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
    frame.innerHTML = '<div class="chart-loading">Chart unavailable — <a href="https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD" target="_blank" rel="noreferrer">open TradingView ↗</a></div>';
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
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isAppleMobile && !installed) {
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
    byId("install-button").hidden = false;
  });
  byId("install-button").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    byId("install-button").hidden = true;
  });
}

function setupNav() {
  const links = Array.from(document.querySelectorAll(".nav-link"));
  links.forEach((link) => link.addEventListener("click", () => {
    links.forEach((item) => item.classList.toggle("selected", item === link));
  }));
}

async function init() {
  updateClock();
  window.setInterval(updateClock, 1000);
  mountTradingView();
  setupInstallPrompt();
  setupNav();
  byId("subscribe-button").addEventListener("click", subscribeForPush);
  byId("test-button").addEventListener("click", sendTestAlert);
  byId("unsubscribe-button").addEventListener("click", unsubscribePush);
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
