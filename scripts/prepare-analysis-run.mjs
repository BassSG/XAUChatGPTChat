import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareRun} from './analysis-runtime.mjs';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {contextPath,context:c}=await prepareRun({repo,root:resolve(option('--runtime-root')||resolve(repo,'../../outputs/desk-runtime'))});
// Small startup output: the full, private context remains available for targeted reads.
console.log(JSON.stringify({contextPath,startedAt:c.startedAt,contractsChanged:c.contractsChanged,changedContracts:c.changedContracts,
  readFirst:resolve(repo,'FAST_RUN_WORKFLOW.md'),readFullContracts:c.contractsChanged,
  latest:c.latest,baseline:{state:c.baseline.state,reason:c.baseline.reason,id:c.baseline.baseline?.id,refreshAt:c.baseline.baseline?.refreshAt},
  carryEvidence:c.carryEvidence,historicalStructure:c.historicalStructure?{state:c.historicalStructure.state,carryApproved:false,evidencePath:c.historicalStructure.evidencePath,originalCapturedAt:c.historicalStructure.originalCapturedAt,instruction:c.historicalStructure.instruction}:null,
  journal:{...c.journal,pendingCandidates:c.journal.pendingCandidates.map(({planId,line,reviewHint,reviewForPlanId})=>({planId,line,reviewHint,reviewForPlanId}))},
  browserHints:c.browserHints,requiredFresh:c.requiredFresh,newsWindow:c.newsWindow,
  deskArchitecture:c.deskArchitecture,supplemental:{indicator:c.supplemental.indicatorVerification?.state||'UNAVAILABLE',dxyBaseline:c.supplemental.dxyBaseline?.state||'UNAVAILABLE',spdrDates:c.supplemental.spdrHistory.length,gaps:c.supplemental.gaps},
  collectUntil:c.budget.collectUntil,targetFinishAt:c.budget.targetFinishAt,progressPath:c.progressPath}));
