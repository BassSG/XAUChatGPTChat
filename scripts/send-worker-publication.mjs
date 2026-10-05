import {readFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRunFailure} from '../src/analysis-run-state.js';

export async function sendWorkerPublication({url,token,payload,failure=false,fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))}) {
  if(!url?.startsWith('https://')||!token)throw new Error('Worker URL and publishing credential must be configured.');
  if(failure)validateRunFailure(payload);
  let result,removed=0,registered=0;
  for(let attempt=1;attempt<=3;attempt++) {
    // Never log request headers, payload or an arbitrary server error.
    const response=await fetchImpl(url.replace(/\/$/,'')+(failure?'/api/admin/analysis-runs':'/api/admin/reports'),{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000)
    }).catch(()=>null);
    if(!response){if(attempt<3){await wait(1500);continue;}throw new Error('Worker publish request failed.');}
    result=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status>=500&&attempt<3){await wait(1500);continue;}
      throw new Error('Worker publish failed with HTTP '+response.status+'.');
    }
    const n=result.notifications;
    if(n){removed+=n.removed||0;registered=Math.max(registered,n.registered||0);}
    if(n?.failed>0&&attempt<3){await wait(1500);continue;}
    if(n)result.notifications={...n,registered,removed};
    if(!n||n.registered===0||n.failed>0||removed>0)throw Object.assign(new Error('Notification delivery is incomplete; check registered devices and delivery receipt.'),{receipt:result});
    return result;
  }
  throw new Error('Publication retry limit reached.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const failure=process.argv.includes('--failure');
    const report=(!failure||process.argv.includes('--from-report'))?JSON.parse(await readFile('public/reports/latest.json','utf8')):null;
    const payload=failure?{runId:process.env.RUN_ID,startedAt:process.env.RUN_STARTED_AT||report?.snapshotAt,status:'FAILED',code:process.env.FAILURE_CODE}:report;
    const result=await sendWorkerPublication({url:process.env.WORKER_URL,token:process.env.REPORT_TOKEN,payload,failure});
    console.log(JSON.stringify(result));
  }catch(error){
    if(error.receipt)console.error(JSON.stringify(error.receipt));
    if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'failureCode='+(error.receipt?'DELIVERY_FAILED':'PUBLICATION_FAILED')+'\n');
    console.error(error.message);process.exitCode=1;
  }
}
