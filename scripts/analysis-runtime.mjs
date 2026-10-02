import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join, resolve} from 'node:path';
import {deskEvidenceReferences,validateDeskV4} from '../src/desk-v4.js';
import {validateEvidencePack} from '../src/analysis-evidence.js';
import {DESK_POLICY,LOCATION_POLICY} from '../src/desk-policy.js';
import {RUN_POLICY} from '../src/run-policy.js';
import {requirePrivatePath} from './fmp-cache.mjs';
import {bangkok} from './fmp-context.mjs';

export const CONTRACT_FILES = ['FAST_RUN_WORKFLOW.md','SCHEDULE_WORKFLOW.md','V4_REASONING_CONTRACT.md','V4_2_LOCATION_CONTRACT.md','ANALYSIS_OPERATING_PLAN.md'];
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export function nextScheduledAt(now) {
  const thai=new Date(now+7*3600000),day=Date.UTC(thai.getUTCFullYear(),thai.getUTCMonth(),thai.getUTCDate());
  for(let offset=0;offset<8;offset++) {
    const date=day+offset*86400000,weekday=new Date(date).getUTCDay();
    if(weekday===0 || weekday===6) continue;
    for(const minute of [9*60,14*60+30,19*60]) {const at=date+minute*60000-7*3600000;if(at>now)return at;}
  }
  throw new Error('Next weekday schedule unavailable');
}
const json = text => JSON.parse(text.replace(/^\uFEFF/,''));
async function readJson(path) { try { return json(await readFile(path,'utf8')); } catch { return null; } }
export async function savePrivateJson(path, value) {
  await mkdir(resolve(path,'..'),{recursive:true});
  const temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n','utf8');
  await rename(temporary,path);
}
export function baselineCandidate(report, now) {
  const b = report?.schemaVersion === 4 ? report.desk?.baseline : null;
  if (!b) return {state:'REFRESH_REQUIRED',reason:'NO_V4_BASELINE'};
  const created = Date.parse(b.createdAt), refresh = Date.parse(b.refreshAt);
  if (report.testOnly || report.dataClass === 'TEST_FIXTURE') return {state:'REFRESH_REQUIRED',reason:'TEST_REPORT'};
  if (b.status !== 'ACTIVE' || report.desk.rebaseline?.state === 'REQUIRED') return {state:'REFRESH_REQUIRED',reason:'SUSPENDED_OR_REBASELINE'};
  if (!Number.isFinite(created) || created > now || now-created > DESK_POLICY.baselineMaxHours*3600000 || !Number.isFinite(refresh) || now>=refresh) return {state:'REFRESH_REQUIRED',reason:'EXPIRED_OR_INVALID_TIME'};
  return {
    state:'CANDIDATE_NEEDS_CURRENT_H1', reason:'ORIGINAL_HTF_NOT_EXPIRED',
    baseline:structuredClone(b),
    tacticalReuseAllowed:false,
    instruction:'Keep original W1/D1/H4 bar times. Read current closed H1, check Critical Zone/re-baseline and new M15/M5 before accepting carry. An old checkedAt is never a current check.'
  };
}
export function journalIndex(text) {
  // A complete local index avoids feeding the growing journal back to the model.
  // Keep original section/line locations so uncertain outcomes can be read in full.
  const lines=text.split(/\r?\n/), entries=new Map();
  for(let i=0;i<lines.length;i++) {
    if(!/^#{2,3}\s/.test(lines[i])) continue;
    const match=/(\d{8}-\d{4}-[A-Za-z0-9_-]+)/.exec(lines[i]);
    if(!match && !/\d{1,2}\s+[^\d\n]+\s+\d{4}/.test(lines[i])) continue;
    const planId=match?.[1] || null,key=planId || 'historical-line-'+(i+1);
    let end=i+1; while(end<lines.length && !/^#{2,3}\s/.test(lines[end])) end++;
    const section=lines.slice(i,end).join('\n');
    const outcome=section.match(/(?:outcome|ผลทบทวน|สถานะผลย้อนหลัง)["'\s:]+([^\r\n]{1,180})/i)?.[1] || null;
    let reviewForPlanId=null;
    try {reviewForPlanId=json(section.match(/Prior review:\s*(\{[^\r\n]+\})/i)?.[1] || '{}').planId || null;} catch { /* Unstructured history must be read manually. */ }
    const previous=entries.get(key);
    entries.set(key,{planId,heading:lines[i].replace(/^#+\s/,''),line:i+1,endLine:end,previousLines:[...(previous?.previousLines || []),...(previous?[previous.line]:[])],
      reviewHint:!planId?'HISTORICAL_SECTION':/รอตรวจ|PENDING|รอทบทวน/i.test(section)?'PENDING_OR_MENTIONED':reviewForPlanId===planId?'HAS_REVIEW_TEXT':'CHECK_SECTION',
      reviewForPlanId,outcome});
  }
  return [...entries.values()];
}
export function runBudget(startedAt, now) {
  const elapsed=Math.max(0,now-Date.parse(startedAt));
  return {elapsedSeconds:Math.floor(elapsed/1000),
    mode:elapsed>=RUN_POLICY.collectMinutes*60000?'FINALIZE_AVAILABLE':'COLLECT',
    targetExceeded:elapsed>=RUN_POLICY.targetMinutes*60000,
    action:elapsed>=RUN_POLICY.collectMinutes*60000?'Stop optional reads/retries; assemble verified information, refresh final quote/calendar if accessible, journal, PNG, publish. Never bypass freshness/evidence gates.':'Collect primary inputs; one focused retry per blocked source.'};
}
export function recordRunStage(progress, stage, now, source=null) {
  const budget=runBudget(progress.startedAt,now),event={stage,at:bangkok(now),...budget};
  if(stage==='RETRY') {
    if(!['PEPPERSTONE','FOREX_FACTORY','DXY','SPDR','EBW','PLAN_REVIEW'].includes(source)) throw new Error('Use a known source for retry accounting');
    const used=progress.events.filter(e=>e.stage==='RETRY' && e.source===source && e.retryAllowed).length;
    Object.assign(event,{source,retryAllowed:used<RUN_POLICY.retryPerSource && budget.mode==='COLLECT',
      retryReason:budget.mode!=='COLLECT'?'COLLECTION_BUDGET':used>=RUN_POLICY.retryPerSource?'RETRY_LIMIT':'ONE_FOCUSED_RETRY'});
  }
  progress.events.push(event);
  if(['PUBLISHED','FAILED'].includes(stage)) {progress.finishedAt=bangkok(now);progress.totalSeconds=budget.elapsedSeconds;progress.result=stage;}
  return event;
}
export async function acknowledgeContracts(context) {
  const statePath=resolve(context.runDir,'../../startup-state.json');
  const previous=await readJson(statePath) || {};
  await savePrivateJson(statePath,{...previous,contractHash:context.contractHash,acknowledgedAt:bangkok(Date.now())});
}
export async function prepareRun({repo,root,now=Date.now()}) {
  requirePrivatePath(root,repo);
  const runDir=join(root,'runs',new Date(now).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
  const contracts=await Promise.all(CONTRACT_FILES.map(async name=>({name,path:join(repo,name),sha256:sha256(await readFile(join(repo,name),'utf8'))})));
  const contractHash=sha256(JSON.stringify(contracts.map(({name,sha256})=>({name,sha256}))));
  const previous=await readJson(join(root,'startup-state.json'));
  const changed=previous?.contractHash!==contractHash;
  const reportPath=join(repo,'public/reports/latest.json');
  let report=null,reportHash=null;
  try { report=json(await readFile(reportPath,'utf8'));reportHash=sha256(JSON.stringify(report)); } catch { /* A missing latest report requires initial collection. */ }
  const journalPath=resolve(repo,'../../outputs/XAUUSD_Trading_Desk_Journal.md');
  let index=[],journalError=null;
  try { index=journalIndex(await readFile(journalPath,'utf8')); } catch {journalError='Journal unavailable: restore before publication';}
  const journalIndexPath=join(runDir,'journal-index.json');
  await savePrivateJson(journalIndexPath,{path:journalPath,entries:index,error:journalError});
  const candidate=baselineCandidate(report,now);
  let carryEvidencePath=null, evidenceError=null, originalCapture=null, chartUrl=null;
  if(candidate.state==='CANDIDATE_NEEDS_CURRENT_H1') {
    try {
      validateDeskV4(report);
      const b=report.desk.baseline;
      const originalAt=b.mode==='CARRY_FORWARD'?b.originSnapshotAt:report.snapshotAt;
      const stamp=new Date(originalAt).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
      const original=await readJson(join(repo,'public/reports/archive','analysis-'+stamp+'.json'));
      const expectedHash=b.mode==='CARRY_FORWARD'?b.originReportSha256:reportHash;
      if(!original || original.schemaVersion!==4 || sha256(JSON.stringify(original))!==expectedHash || original.planId!==(b.mode==='CARRY_FORWARD'?b.originPlanId:report.planId)) throw new Error('Original immutable report unverifiable');
      for(const k of ['id','createdAt','frames','bias','invalidation','refreshAt']) if(JSON.stringify(original.desk.baseline[k])!==JSON.stringify(b[k])) throw new Error('Baseline differs from original');
      const hash=report.evidenceArchive?.sha256;
      if(!/^[a-f0-9]{64}$/.test(hash||'')) throw new Error('Missing hash');
      const pack=validateEvidencePack(await readJson(resolve(repo,'../../outputs/analysis-evidence',hash+'.json')));
      if(sha256(JSON.stringify(pack))!==hash) throw new Error('Evidence integrity mismatch');
      if(Date.parse(pack.capturedAt)>Date.parse(report.snapshotAt) || Date.parse(report.snapshotAt)>now) throw new Error('Future or inconsistent source snapshot');
      const refs=deskEvidenceReferences({baseline:report.desk.baseline,dailySR:report.desk.dailySR,amm:report.desk.amm});
      const frames={};
      for(const ref of refs) {
        const bar=pack.frames[ref.timeframe]?.find(b=>Date.parse(b.closedAt)===Date.parse(ref.closedAt));
        if(!bar || !['open','high','low','close'].every(k=>bar[k]===ref.bar[k])) throw new Error('Missing structural bar');
        frames[ref.timeframe] ||= [];
        if(!frames[ref.timeframe].some(b=>b.closedAt===bar.closedAt)) frames[ref.timeframe].push(bar);
      }
      for(const bars of Object.values(frames)) bars.sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt));
      const carried={version:pack.version,symbol:pack.symbol,capturedAt:pack.capturedAt,chartUrl:pack.chartUrl,method:pack.method,frames,
        gaps:[...pack.gaps,'Historical structural observations only; read new H1/M15/M5 and quote for this run.']};
      validateEvidencePack(carried);
      carryEvidencePath=join(runDir,'carry-evidence.json');
      await savePrivateJson(carryEvidencePath,carried);
      originalCapture=pack.capturedAt; chartUrl=pack.chartUrl;
    } catch { candidate.state='REFRESH_REQUIRED';candidate.reason='PRIVATE_STRUCTURAL_EVIDENCE_UNVERIFIABLE';delete candidate.baseline;evidenceError='Re-read HTF: original hash/references could not be verified'; }
  }
  if(candidate.baseline) {
    const b=candidate.baseline;
    // Carrying an INITIAL baseline must link the actual original published JSON.
    if(b.mode!=='CARRY_FORWARD') Object.assign(b,{originPlanId:report.planId,originSnapshotAt:report.snapshotAt,originReportSha256:reportHash});
    candidate.baseline.mode='CARRY_FORWARD';
  }
  const context={version:1,startedAt:bangkok(now),contractHash,contractsChanged:changed,contracts,
    latest:{path:reportPath,schemaVersion:report?.schemaVersion??null,planId:report?.planId??null,snapshotAt:report?.snapshotAt??null,status:report?.status??null,sha256:reportHash},
    baseline:candidate,carryEvidence:{path:carryEvidencePath,originalCapturedAt:originalCapture,error:evidenceError},
    carryLevels:candidate.baseline?report.desk.dailySR:null,
    journal:{path:journalPath,indexPath:journalIndexPath,count:index.length,legacySections:index.filter(e=>!e.planId).length,
      pendingCandidates:index.filter(e=>e.planId && e.reviewHint!=='HAS_REVIEW_TEXT').slice(-8),error:journalError},
    browserHints:previous?.browserHints||{chart:chartUrl||report?.evidence?.chartUrl||null,calendar:'https://www.forexfactory.com/calendar',dxy:'https://www.tradingview.com/symbols/TVC-DXY/',spdr:'https://www.spdrgoldshares.com/usa/gld/'},
    deskArchitecture:'4.2',newReportPolicy:LOCATION_POLICY,
    requiredFresh:['PEPPERSTONE closed H1 invalidation check','Location scan above/current/below before archetype selection','M15 confirmation appropriate to selected archetype','M5 subsequent trigger/fine entry','Bid/Ask/spread near final snapshot','DXY structural filter','Forex Factory current USD calendar/news'],
    newsWindow:{from:bangkok(Math.max(now-24*3600000,Math.min(now,Date.parse(report?.snapshotAt)||now-12*3600000))),to:bangkok(nextScheduledAt(now))},
    neverCarryAsLive:['quote','latest H1/M15/M5 confirmation','DXY current value','confirmed news Actual'],
    budget:{...RUN_POLICY,collectUntil:bangkok(now+RUN_POLICY.collectMinutes*60000),targetFinishAt:bangkok(now+RUN_POLICY.targetMinutes*60000)},
    progressPath:join(runDir,'progress.json'),runDir};
  const contextPath=join(runDir,'context.json');
  await savePrivateJson(contextPath,context);
  await savePrivateJson(context.progressPath,{version:1,startedAt:context.startedAt,events:[],tokens:null,tokenNote:'Token usage is not exposed by this runner; never invent savings.'});
  await savePrivateJson(join(root,'startup-state.json'),{...previous,version:1,preparedContractHash:contractHash,preparedAt:context.startedAt,contextPath,browserHints:context.browserHints});
  return {contextPath,context};
}
