import {readFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {validateRunFailure} from '../src/analysis-run-state.js';
import {requirePrivatePath} from './fmp-cache.mjs';
import {savePrivateJson} from './analysis-runtime.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dispatch=async args=>new Promise((resolveResult,reject)=>{
  execFile('gh',args,{cwd:repo,windowsHide:true,timeout:20000},(error)=>error?reject(new Error('Could not queue the failure notification workflow.')):resolveResult());
});
export function failureCode(step,error='') {
  if(step==='EVIDENCE'||/archive|recorded evidence/i.test(error))return 'EVIDENCE_MISMATCH';
  if(/PUBLISH|PUBLICATION/i.test(step))return 'PUBLICATION_FAILED';
  return 'VALIDATION_FAILED';
}
export async function queueAnalysisFailure(context,{code='VALIDATION_FAILED',dispatchImpl=dispatch,now=Date.now()}={}) {
  requirePrivatePath(context.runDir,repo);requirePrivatePath(context.progressPath,repo);
  const receiptPath=resolve(context.runDir,'failure-notification.json');
  try {const receipt=JSON.parse(await readFile(receiptPath,'utf8'));if(receipt.state==='QUEUED')return receipt;}catch{/* First attempt. */}
  const progress=JSON.parse(await readFile(context.progressPath,'utf8'));
  const payload=validateRunFailure({runId:basename(context.runDir),startedAt:progress.startedAt,status:'FAILED',code},now);
  let result;
  try {
    await dispatchImpl(['workflow','run','analysis-status.yml','--repo','BassSG/XAUChatGPTChat','--ref','main',
      '-f','runId='+payload.runId,'-f','startedAt='+payload.startedAt,'-f','code='+payload.code]);
    result={state:'QUEUED',...payload,queuedAt:new Date(now).toISOString(),deliveryVerified:false};
  }catch{result={state:'QUEUE_FAILED',...payload,checkedAt:new Date(now).toISOString(),deliveryVerified:false,reason:'Failure notification could not be queued; report this in Codex.'};}
  await savePrivateJson(receiptPath,result);return result;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try {
    const path=option('--context');if(!path)throw new Error('Use --context private-context.json [--code EVIDENCE_MISMATCH|VALIDATION_FAILED|SOURCE_UNAVAILABLE|PUBLICATION_FAILED|DELIVERY_FAILED]');
    requirePrivatePath(resolve(path),repo);
    const result=await queueAnalysisFailure(JSON.parse(await readFile(path,'utf8')),{code:option('--code')||'VALIDATION_FAILED'});
    console.log(JSON.stringify(result));if(result.state!=='QUEUED')process.exitCode=2;
  }catch{console.error('Failure notification not queued: invalid private context or run status.');process.exitCode=2;}
}
