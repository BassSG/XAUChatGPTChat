// One policy consumed by reasoning, validation, UI and the publication boundary.
export const DESK_POLICY = Object.freeze({
  id: 'XAU_V4_1', newsBeforeMinutes: 30, newsAfterMinutes: 30,
  postNewsReviewMinutes: 60, minimumNetR: 1.5,
  baselineMaxHours: 168, baselineCheckMinutes: 120,
  displacementBodyRatio: 0.7, abnormalRangeMultiple: 1.5
});
export function newsEmbargo(events = [], at = Date.now()) {
  const now = typeof at === 'number' ? at : Date.parse(at);
  return events.filter(e => e.currency === 'USD' && e.impact === 'HIGH' &&
    Number.isFinite(Date.parse(e.at)) && now >= Date.parse(e.at) - DESK_POLICY.newsBeforeMinutes * 60000 &&
    now <= Date.parse(e.at) + DESK_POLICY.newsAfterMinutes * 60000);
}
export function assertProductionReport(report) {
  if (report.testOnly || report.dataClass === 'TEST_FIXTURE') {
    throw new Error('Test fixtures cannot be published as live reports');
  }
}
export function validateNewsEvents(report) {
  for (const event of report.newsEvents || []) {
    if (Object.hasOwn(event,'actual') && (event.actual == null || event.actual === '' || event.state !== 'RELEASED' ||
      !Number.isFinite(Date.parse(event.at)) || Date.parse(event.at)>Date.parse(report.snapshotAt) || !String(event.sourceUrl || '').startsWith('https://'))) {
      throw new Error('Actual requires an elapsed release and a verified source URL');
    }
  }
}
