import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchReportEvidence } from '../src/analysis-evidence.js';
import { reviewPlan } from '../src/plan-review.js';
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const hash = object => createHash('sha256').update(JSON.stringify(object)).digest('hex');
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const root = option('--archive-root') || join(scriptRoot, '../../../outputs/analysis-evidence');
const report = await read(option('--input'));
const archived = async sha => {
  if (!/^[a-f0-9]{64}$/.test(sha || '')) throw new Error('Invalid evidence hash');
  const pack = await read(join(root, sha + '.json'));
  if (hash(pack) !== sha) throw new Error('Evidence archive content has changed');
  return pack;
};
const pack = await archived(report.evidenceArchive?.sha256);
matchReportEvidence(report, pack);
if (report.evidenceArchive.capturedAt !== pack.capturedAt || report.evidenceArchive.method !== pack.method || JSON.stringify(report.evidenceArchive.counts) !== JSON.stringify(Object.fromEntries(Object.entries(pack.frames).map(([key, bars]) => [key, bars.length])))) throw new Error('Evidence archive metadata differs from its contents');
const review = report.priorReview;
if (review && (!['ตรวจไม่ได้','รอตรวจ'].includes(review.outcome) || review.simulatedR != null)) {
  if (review.reviewMethod !== 'RULE_REPLAY_V1' || !Number.isFinite(Date.parse(review.originalSnapshotAt))) throw new Error('A proven prior outcome requires a reproducible review');
  const stamp = new Date(review.originalSnapshotAt).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
  const original = await read(join(scriptRoot, '../public/reports/archive/analysis-' + stamp + '.json'));
  if (hash(original) !== review.originalReportSha256 || original.planId !== review.planId) throw new Error('Original plan differs from the published archive');
  const expected = reviewPlan(original, await archived(review.evidenceSha256));
  for (const key of ['planId','checkedAt','outcome','resultStatus','simulatedR','timeline','evidence','reviewFrom','reviewTo']) {
    if (JSON.stringify(review[key]) !== JSON.stringify(expected[key])) throw new Error('Prior review differs from replay: ' + key);
  }
}
console.log('Private observations match the report; any proven prior outcome matches replay.');
