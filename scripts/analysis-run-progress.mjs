import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {recordRunStage,claimRunTask,savePrivateJson,acknowledgeContracts} from './analysis-runtime.mjs';
import {requirePrivatePath} from './fmp-cache.mjs';
import {queueAnalysisFailure,failureCode} from './notify-analysis-failure.mjs';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const path=option('--context'),stage=option('--stage');
if(!path || !['CHECK','STEP','CONTRACTS_READ','PRIMARY','CONTEXT','FINALIZING','ARTIFACTS','READY','PUBLISHED','FAILED','RETRY'].includes(stage)) throw new Error('Use --context private-context.json --stage CHECK|STEP|CONTRACTS_READ|PRIMARY|CONTEXT|FINALIZING|ARTIFACTS|READY|PUBLISHED|FAILED|RETRY [--task H1|M15|M5|HTF_REFRESH|FOREX_FACTORY|DXY|FMP|SPDR|EBW|TOOLKIT|PLAN_REVIEW|SNAPSHOT_REFRESH|PUBLISH|VERIFY_PUBLICATION] [--retry]');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');requirePrivatePath(path,repo);
const c=JSON.parse(await readFile(path,'utf8'));requirePrivatePath(c.progressPath,repo);
const progress=JSON.parse(await readFile(c.progressPath,'utf8')),now=Date.now();
const event=stage==='STEP'?claimRunTask(progress,option('--task'),now,{retry:args.includes('--retry')}):recordRunStage(progress,stage,now,option('--source'));
await savePrivateJson(c.progressPath,progress);
if(['CONTRACTS_READ','READY'].includes(stage)) {requirePrivatePath(resolve(c.runDir,'../../startup-state.json'),repo);await acknowledgeContracts(c);}
if(stage==='FAILED') {
  let failure=null;try {failure=JSON.parse(await readFile(resolve(c.runDir,'finalize-result.json'),'utf8'));}catch{/* Publication may fail without a finalizer failure. */}
  event.failureNotification=await queueAnalysisFailure(c,{code:failure?.ok===false?failureCode(failure.step,failure.error):'PUBLICATION_FAILED'});
}
console.log(JSON.stringify({...event,progressPath:c.progressPath}));
if(event.allowed===false) process.exitCode=2;
