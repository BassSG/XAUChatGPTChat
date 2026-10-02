// One policy consumed by reasoning, validation, UI and the publication boundary.
export const DESK_POLICY = Object.freeze({
  id: 'XAU_V4_1', newsBeforeMinutes: 30, newsAfterMinutes: 30,
  postNewsReviewMinutes: 60, minimumNetR: 1.5,
  baselineMaxHours: 168, baselineCheckMinutes: 120,
  displacementBodyRatio: 0.7, abnormalRangeMultiple: 1.5
});
// Historical reports keep their published policy. New 4.2 reports name this policy explicitly.
export const LOCATION_POLICY = Object.freeze({
  ...DESK_POLICY, id:'XAU_V4_2', minimumNetR:1.1, preferredNetR:1.5,
  newsBeforeMinutes:120, newsAfterMinutes:120, equalLevelTolerance:0.0012
});
export function reportPolicy(report) {
  return report?.schemaVersion===4 && report.desk?.architectureVersion==='4.2' && report.desk.policyId===LOCATION_POLICY.id ? LOCATION_POLICY : DESK_POLICY;
}
export function newsEmbargo(events = [], at = Date.now(), policy = DESK_POLICY) {
  const now = typeof at === 'number' ? at : Date.parse(at);
  return events.filter(e => e.currency === 'USD' && e.impact === 'HIGH' &&
    Number.isFinite(Date.parse(e.at)) && now >= Date.parse(e.at) - policy.newsBeforeMinutes * 60000 &&
    now <= Date.parse(e.at) + policy.newsAfterMinutes * 60000);
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
