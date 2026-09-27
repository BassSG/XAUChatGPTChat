import { CandlestickSeries, ColorType, LineStyle, createChart } from "lightweight-charts";
import { resolveDatasetUrl, validateCandleDataset, validateChartPlan } from "./chart-data.js";

const COLORS = {
  gold: "#f2c45e",
  goldFill: "rgba(242, 196, 94, 0.20)",
  stop: "#ff4d58",
  target: "#29d6cb",
  grid: "rgba(116, 149, 157, 0.20)",
  text: "#dce7e5"
};

function price(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

class ZoneRenderer {
  constructor(view) { this.view = view; }
  draw(target) {
    const { top, bottom, visible } = this.view;
    if (!visible || top === null || bottom === null) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ratio = scope.verticalPixelRatio;
      const y = Math.round(Math.min(top, bottom) * ratio);
      const height = Math.max(1, Math.round(Math.abs(bottom - top) * ratio));
      scope.context.fillStyle = COLORS.goldFill;
      scope.context.fillRect(0, y, scope.bitmapSize.width, height);
      scope.context.strokeStyle = COLORS.gold;
      scope.context.lineWidth = Math.max(1, ratio);
      scope.context.strokeRect(0, y, scope.bitmapSize.width, height);
    });
  }
}

class ZoneView {
  constructor(source) { this.source = source; this.top = null; this.bottom = null; this.visible = true; this.rendererInstance = new ZoneRenderer(this); }
  update() {
    this.visible = this.source.visible;
    this.top = this.source.series?.priceToCoordinate(this.source.high) ?? null;
    this.bottom = this.source.series?.priceToCoordinate(this.source.low) ?? null;
  }
  zOrder() { return "bottom"; }
  renderer() { return this.rendererInstance; }
}

class PriceZonePrimitive {
  constructor(low, high) { this.low = low; this.high = high; this.visible = true; this.view = new ZoneView(this); }
  attached({ series, requestUpdate }) { this.series = series; this.requestUpdate = requestUpdate; }
  paneViews() { return [this.view]; }
  updateAllViews() { this.view.update(); }
  autoscaleInfo() { return this.visible ? { priceRange: { minValue: this.low, maxValue: this.high } } : null; }
  setVisible(visible) { this.visible = visible; this.requestUpdate?.(); }
}

class PlanRangePrimitive {
  constructor(low, high) { this.low = low; this.high = high; }
  autoscaleInfo() { return { priceRange: { minValue: this.low, maxValue: this.high } }; }
}

function lineOptions(priceValue, title, color, style = LineStyle.Dashed) {
  return { price: priceValue, title, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, lineVisible: true };
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

export function createPlanChart({ baseUrl, formatDate }) {
  const state = {
    report: null,
    validation: null,
    activeFrame: null,
    requestId: 0,
    abortController: null,
    chart: null,
    series: null,
    zone: null,
    range: null,
    entryLines: [],
    stopLines: [],
    targetLines: [],
    resizeObserver: null
  };

  function setView(name, detail = "") {
    document.getElementById("plan-chart-loading").hidden = name !== "loading";
    document.getElementById("plan-chart-canvas").hidden = name !== "chart";
    document.getElementById("plan-chart-fallback").hidden = name !== "fallback";
    if (name === "fallback") text("plan-chart-fallback-detail", detail);
  }

  function clearChart() {
    state.resizeObserver?.disconnect();
    state.resizeObserver = null;
    state.chart?.remove();
    state.chart = null;
    state.series = null;
    state.zone = null;
    state.range = null;
    state.entryLines = [];
    state.stopLines = [];
    state.targetLines = [];
    document.getElementById("plan-chart-canvas").replaceChildren();
  }

  function updateSummary(report, plan) {
    text("plan-chart-status", report.status || "WAIT");
    text("plan-chart-wait", report.waitFor || report.planState || "รอเงื่อนไขจากรายงาน");
    text("plan-chart-side", plan.side === "BUY" ? "เฝ้าซื้อเมื่อยืนยัน" : plan.side === "SELL" ? "เฝ้าขายเมื่อยืนยัน" : "รอประเมินทิศทาง");
    text("plan-chart-entry", plan.entryZone ? `${price(plan.entryZone.low)}–${price(plan.entryZone.high)}` : "ยังไม่มีโซนที่ยืนยันได้");
    text("plan-chart-trigger", report.trigger || "รอแท่งปิดยืนยัน");
    text("plan-chart-stop", plan.stop.kind === "FIXED_VERIFIED" ? price(plan.stop.price) : (plan.stop.note || "รอโครงสร้างจริงและ spread"));
    text("plan-chart-targets", plan.targets.length ? plan.targets.map((target) => `${target.label} ${price(target.price)}`).join(" / ") : "ยังไม่มีเป้าหมายที่ยืนยันได้");
    text("plan-chart-invalidation", report.invalidation || "ตรวจเงื่อนไขยกเลิกในรายงาน");
    text("plan-chart-asof", `ข้อมูล ณ รอบวิเคราะห์ ${formatDate(report.snapshotAt)}`);
    text("plan-chart-source-detail", `${plan.symbol} · snapshot ${formatDate(plan.asOf)}`);
  }

  function updateFrameButtons(frames) {
    document.querySelectorAll("[data-chart-frame]").forEach((button) => {
      const frame = button.dataset.chartFrame;
      const available = frames.includes(frame);
      button.disabled = !available;
      button.title = available ? `เปิดกรอบ ${frame}` : `รอบนี้ไม่มีข้อมูล ${frame} ที่ผ่านการตรวจ`;
      button.classList.toggle("active", frame === state.activeFrame);
    });
  }

  function createLines(plan) {
    const scaleLevels = [
      ...(plan.entryZone ? [plan.entryZone.low, plan.entryZone.high] : []),
      ...(plan.stop.kind === "FIXED_VERIFIED" ? [plan.stop.price] : []),
      ...plan.targets.map((target) => target.price)
    ];
    if (scaleLevels.length) {
      state.range = new PlanRangePrimitive(Math.min(...scaleLevels), Math.max(...scaleLevels));
      state.series.attachPrimitive(state.range);
    }
    if (plan.entryZone) {
      state.zone = new PriceZonePrimitive(plan.entryZone.low, plan.entryZone.high);
      state.series.attachPrimitive(state.zone);
      state.entryLines = [
        state.series.createPriceLine(lineOptions(plan.entryZone.low, "โซนเข้า", COLORS.gold, LineStyle.Solid)),
        state.series.createPriceLine(lineOptions(plan.entryZone.high, "โซนเข้า", COLORS.gold, LineStyle.Solid))
      ];
    }
    if (plan.stop.kind === "FIXED_VERIFIED") {
      state.stopLines = [state.series.createPriceLine(lineOptions(plan.stop.price, "STOP", COLORS.stop))];
    }
    state.targetLines = plan.targets.map((target) => state.series.createPriceLine(lineOptions(target.price, target.label, COLORS.target)));
  }

  function draw(candles, plan) {
    clearChart();
    setView("chart");
    const host = document.getElementById("plan-chart-canvas");
    state.chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#081317" }, textColor: COLORS.text, fontFamily: '"Noto Sans Thai", "Segoe UI", sans-serif', attributionLogo: true },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: "#46575b", scaleMargins: { top: 0.14, bottom: 0.14 } },
      timeScale: { borderColor: "#46575b", timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 9 },
      crosshair: { vertLine: { color: "#8ea4aa66" }, horzLine: { color: "#8ea4aa66" } },
      handleScroll: true,
      handleScale: true,
      localization: { locale: "th-TH", priceFormatter: price }
    });
    state.series = state.chart.addSeries(CandlestickSeries, {
      upColor: "#18bda9", downColor: "#ff4d58", wickUpColor: "#31d5c1", wickDownColor: "#ff7880", borderVisible: false,
      priceLineVisible: true, lastValueVisible: true
    });
    state.series.setData(candles);
    createLines(plan);
    state.chart.timeScale().fitContent();
    state.resizeObserver = new ResizeObserver(() => state.chart?.timeScale().applyOptions({}));
    state.resizeObserver.observe(host);
    applyToggleState();
  }

  function applyToggleState() {
    const entry = document.getElementById("toggle-entry").checked;
    const stop = document.getElementById("toggle-stop").checked;
    const targets = document.getElementById("toggle-targets").checked;
    state.zone?.setVisible(entry);
    state.entryLines.forEach((line) => line.applyOptions({ visible: entry }));
    state.stopLines.forEach((line) => line.applyOptions({ visible: stop }));
    state.targetLines.forEach((line) => line.applyOptions({ visible: targets }));
  }

  async function loadFrame(frame) {
    const report = state.report;
    const plan = state.validation?.plan;
    const meta = plan?.datasets?.[frame];
    if (!report || !plan || !meta) return;
    state.activeFrame = frame;
    updateFrameButtons(state.validation.frames);
    state.abortController?.abort();
    state.abortController = new AbortController();
    const requestId = ++state.requestId;
    setView("loading");
    text("plan-chart-loading-detail", `กำลังตรวจชุดแท่ง ${frame}…`);
    try {
      const url = resolveDatasetUrl(meta.url, { baseUrl, origin: window.location.origin });
      const response = await fetch(url, { cache: "no-store", signal: state.abortController.signal });
      if (!response.ok) throw new Error(`โหลดชุดแท่ง ${frame} ไม่สำเร็จ (${response.status})`);
      const dataset = await response.json();
      const candles = validateCandleDataset(dataset, { timeframe: frame, snapshotAt: report.snapshotAt, expectedCount: meta.count });
      if (requestId !== state.requestId) return;
      if (dataset.lastClosedAt !== meta.lastClosedAt || dataset.capturedAt !== meta.capturedAt) throw new Error("metadata ชุดแท่งไม่ตรงกับรายงาน");
      draw(candles, plan);
      text("plan-chart-frame-note", `${frame} · ${candles.length} แท่งปิดแล้ว · แท่งสุดท้ายปิด ${formatDate(dataset.lastClosedAt)}`);
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== state.requestId) return;
      clearChart();
      setView("fallback", `เปิดกราฟแผนไม่ได้: ${error.message}`);
      text("plan-chart-frame-note", "ใช้ข้อความและแผนผังระดับราคาของรายงานรอบนี้แทน");
    }
  }

  function render(report) {
    state.abortController?.abort();
    state.requestId += 1;
    state.report = report;
    clearChart();
    document.getElementById("chart").classList.remove("buy", "sell", "neutral");
    document.getElementById("chart").classList.add((report?.status || "").includes("BUY") ? "buy" : (report?.status || "").includes("SELL") ? "sell" : "neutral");
    try {
      state.validation = validateChartPlan(report);
      if (!state.validation.available) {
        updateFrameButtons([]);
        text("plan-chart-status", report?.status || "WAIT");
        text("plan-chart-wait", report?.waitFor || "รอชุดแท่งราคาที่ตรวจสอบได้");
        text("plan-chart-asof", report?.snapshotAt ? `รายงาน ${formatDate(report.snapshotAt)}` : "ยังไม่มีรายงาน");
        setView("fallback", `${state.validation.reason} กราฟตลาดด้านล่างยังเปิดดูได้ตามปกติ`);
        document.getElementById("plan-chart-summary").hidden = true;
        return;
      }
      document.getElementById("plan-chart-summary").hidden = false;
      updateSummary(report, state.validation.plan);
      const preferred = state.validation.frames.includes(state.activeFrame) ? state.activeFrame : (["M5", "M15", "H1"].find((frame) => state.validation.frames.includes(frame)) || state.validation.frames[0]);
      loadFrame(preferred);
    } catch (error) {
      state.validation = null;
      updateFrameButtons([]);
      document.getElementById("plan-chart-summary").hidden = true;
      setView("fallback", `ข้อมูลกราฟรอบนี้ไม่ผ่านการตรวจ: ${error.message}`);
    }
  }

  document.querySelectorAll("[data-chart-frame]").forEach((button) => button.addEventListener("click", () => loadFrame(button.dataset.chartFrame)));
  ["toggle-entry", "toggle-stop", "toggle-targets"].forEach((id) => document.getElementById(id).addEventListener("change", applyToggleState));
  document.getElementById("plan-chart-fullscreen").addEventListener("click", async () => {
    const panel = document.getElementById("plan-chart-workspace");
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (panel.requestFullscreen) await panel.requestFullscreen();
  });
  return { render, loadFrame };
}
