export function chooseLatestReport({ worker, pages, current } = {}) {
  const candidates = [current, worker, pages].filter((report) => report && Number.isFinite(Date.parse(report.snapshotAt)));
  if (!candidates.length) return null;
  // Pages is the canonical copy for equal snapshots; Worker can lag after a copy-only repair.
  return candidates.reduce((best, report) => Date.parse(report.snapshotAt) >= Date.parse(best.snapshotAt) ? report : best);
}
