// Each source can paint immediately; a stalled archive must never hide a report.
export async function loadReportSources(sources, onReport, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  return Promise.allSettled(sources.map(async ({ name, url }) => {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          if (controller.signal.aborted) return;
          const report = name === "worker" ? payload.report : payload;
          if (report && Number.isFinite(Date.parse(report.snapshotAt))) onReport(name, report);
          return name;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Report request timed out")); }, timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }));
}
