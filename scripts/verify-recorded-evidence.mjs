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
if (report.schemaVersion === 4 && report.desk.baseline.mode === 'CARRY_FORWARD') {
  const b=report.desk.baseline;
  if(!Number.isFinite(Date.parse(b.originSnapshotAt))) throw new Error('Baseline origin timestamp required');
  const stamp=new Date(b.originSnapshotAt).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
  const original=await read(join(scriptRoot,'../public/reports/archive/analysis-'+stamp+'.json'));
  if(hash(original)!==b.originReportSha256 || original.planId!==b.originPlanId || original.schemaVersion!==4)throw new Error('Baseline origin mismatch');
  const old=original.desk.baseline;
  for(const key of ['id','createdAt','frames','bias','invalidation','refreshAt'])if(JSON.stringify(old[key])!==JSON.stringify(b[key]))throw new Error('Carried baseline changed without refresh: '+key);
}
const review = report.priorReview;
if (review && (!['ตรวจไม่ได้','รอตรวจ'].includes(review.outcome) || review.simulatedR != null)) {
  if (!['RULE_REPLAY_V1','ARCHETYPE_REPLAY_V3'].includes(review.reviewMethod) || !Number.isFinite(Date.parse(review.originalSnapshotAt))) throw new Error('A proven prior outcome requires a reproducible review');
  const stamp = new Date(review.originalSnapshotAt).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
  const original = await read(join(scriptRoot, '../public/reports/archive/analysis-' + stamp + '.json'));
  if (hash(original) !== review.originalReportSha256 || original.planId !== review.planId) throw new Error('Original plan differs from the published archive');
  if((original.reviewRules?.version===3)!==(review.reviewMethod==='ARCHETYPE_REPLAY_V3'))throw new Error('Review method differs from the original published rule version');
  const reviewPack = await archived(review.evidenceSha256);
  if(original.schemaVersion >= 3 && reviewPack.publication?.originalReportSha256 !== hash(original))throw new Error('Review publication receipt differs from original');
  const expected = reviewPlan(original, reviewPack);
  for (const key of ['planId','checkedAt','outcome','resultStatus','simulatedR','timeline','evidence','reviewFrom','reviewTo','scenarioRole']) {
    if (JSON.stringify(review[key]) !== JSON.stringify(expected[key])) throw new Error('Prior review differs from replay: ' + key);
  }
}
console.log('Private observations match the report; any proven prior outcome matches replay.');
