import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {assembleDeskReport} from '../src/desk-generation.js';
import {compareDeskReports} from '../src/desk-comparison.js';
import {validateEvidencePack,matchReportEvidence} from '../src/analysis-evidence.js';
import {claimRunTask,recordRunStage,savePrivateJson,sha256} from './analysis-runtime.mjs';
import {requirePrivatePath} from './fmp-cache.mjs';
import {RUN_POLICY} from '../src/run-policy.js';
import {queueAnalysisFailure,failureCode} from './notify-analysis-failure.mjs';

const scriptRepo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJson=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const fixture=r=>r.testOnly===true && r.dataClass==='TEST_FIXTURE';
export async function executeScript(name,args,{repo=scriptRepo,timeoutMs=RUN_POLICY.toolTimeoutMs}={}) {
  const started=performance.now();
  return new Promise((resolveResult,reject)=>{
    const child=spawn(process.execPath,[join(repo,'scripts',name),...args],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',timedOut=false;
    const append=chunk=>{output=(output+chunk.toString()).slice(-4000);};
    child.stdout.on('data',append);child.stderr.on('data',append);
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);
      if(timedOut || code!==0) reject(new Error(name+': '+(timedOut?'tool timeout':output.trim()||'exit '+code)));
      else resolveResult({script:name,durationMs:Math.round(performance.now()-started)});
    });
  });
}
export async function finalizeAnalysisRun({contextPath,inputPath,observationsPath,testMode=false,
  archiveRoot,execute=executeScript,now=()=>Date.now(),repo=scriptRepo,notifyFailure=queueAnalysisFailure}) {
  for(const path of [contextPath,inputPath,observationsPath]) requirePrivatePath(resolve(path),repo);
  const context=await readJson(contextPath);
  requirePrivatePath(context.runDir,repo);requirePrivatePath(context.progressPath,repo);
  const root=resolve(archiveRoot||resolve(repo,'../../outputs/analysis-evidence'));requirePrivatePath(root,repo);
  const [draft,pack]=await Promise.all([readJson(inputPath),readJson(observationsPath)]);
  if(draft.desk?.architectureVersion!=='4.3') throw new Error('New report draft must use V4.3; no implicit legacy conversion');
  if(testMode?!fixture(draft):(draft.testOnly || draft.dataClass==='TEST_FIXTURE'))
    throw new Error(testMode?'--test requires an explicitly marked TEST_FIXTURE':'Test fixtures cannot finalize as production reports');
  const previous=context.latest?.path?await readJson(context.latest.path):null;
  const fingerprint=sha256(JSON.stringify({draft,pack,previous,testMode,contractHash:context.contractHash,version:1}));
  const resultPath=join(context.runDir,'finalize-result.json');
  let cached=null;try{cached=await readJson(resultPath);}catch{/* First bundle. */}
  const paths={report:join(context.runDir,'report.json'),image:join(context.runDir,'report.png'),body:join(context.runDir,'report.txt')};
  const steps=[],started=performance.now();
  let step='INPUT',claimed=false;
  const run=async(name,args)=>{
    step=name;steps.push(await execute(name,args,{repo,timeoutMs:RUN_POLICY.toolTimeoutMs}));
  };
  const validate=async()=>{
    await run('verify-recorded-evidence.mjs',['--input',paths.report,'--archive-root',root]);
    await run('validate-report.mjs',[...(!testMode?['--publish']:[]),'--input',paths.report,'--image',paths.image,
      ...(draft.chartPlan?['--chart-data-dir',join(context.runDir,'chart-data')]:[])]);
  };
  try {
    if(cached?.fingerprint===fingerprint && !cached.ok) throw new Error('Unchanged failed input: correct the specific draft/evidence error before another attempt');
    if(cached?.fingerprint===fingerprint && cached.ok) {
      let same=true;
      for(const key of Object.keys(paths)) {
        try {if(sha256(await readFile(paths[key]))!==cached.hashes[key]) same=false;} catch {same=false;}
      }
      if(same) {
        // Recheck live freshness and immutable evidence even when reusing the PNG.
        await validate();
        return {...cached,reused:true,verificationSteps:steps,imageNeedsInspection:true};
      }
    }
    const progress=await readJson(context.progressPath);
    const grant=claimRunTask(progress,'FINALIZE',now());
    await savePrivateJson(context.progressPath,progress);
    if(!grant.allowed) throw new Error('Finalization stopped: '+grant.reason+'. Keep verified Codex output; do not publish unvalidated data.');
    claimed=true;step='ASSEMBLE';
    let report=assembleDeskReport(draft);
    if(previous) {
      report.comparison=compareDeskReports(previous,report);report.changeSinceLast=report.comparison.reason;
      report=assembleDeskReport(report);
    }
    step='EVIDENCE';validateEvidencePack(pack);matchReportEvidence(report,pack);
    const canonical=JSON.stringify(pack),hash=sha256(canonical),archivePath=join(root,hash+'.json');
    await mkdir(root,{recursive:true});
    try{await writeFile(archivePath,canonical+'\n',{flag:'wx',encoding:'utf8'});}
    catch(error){if(error.code!=='EEXIST')throw error;if((await readFile(archivePath,'utf8')).trim()!==canonical)throw new Error('Immutable evidence archive mismatch');}
    report.evidenceArchive={sha256:hash,capturedAt:pack.capturedAt,method:pack.method,
      counts:Object.fromEntries(Object.entries(pack.frames).map(([frame,bars])=>[frame,bars.length]))};
    await savePrivateJson(paths.report,report);
    await writeFile(paths.body,report.body+'\n','utf8');
    await run('verify-recorded-evidence.mjs',['--input',paths.report,'--archive-root',root]);
    const validationArgs=[...(!testMode?['--publish']:[]),'--input',paths.report,
      ...(draft.chartPlan?['--chart-data-dir',join(context.runDir,'chart-data')]:[])];
    await run('validate-report.mjs',validationArgs);
    await run('render-analysis-image.mjs',['--input',paths.report,'--output',paths.image]);
    await run('validate-report.mjs',[...validationArgs,'--image',paths.image]);
    const hashes={};for(const key of Object.keys(paths))hashes[key]=sha256(await readFile(paths[key]));
    const result={ok:true,fingerprint,planId:report.planId,snapshotAt:report.snapshotAt,testOnly:testMode,
      ...paths,hashes,steps,totalMs:Math.round(performance.now()-started),reused:false,
      imageNeedsInspection:true,journalRequired:true,publicationAttempted:false};
    await savePrivateJson(resultPath,result);
    const updated=await readJson(context.progressPath);
    recordRunStage(updated,'ARTIFACTS',now());await savePrivateJson(context.progressPath,updated);
    return result;
  } catch(error) {
    // Failed market evidence never reaches the publisher. Operational failure
    // metadata can notify separately, only once the bounded repair loop ends.
    const result={ok:false,fingerprint,step,error:error.message,steps,claimed,
      totalMs:Math.round(performance.now()-started),publicationAttempted:false};
    if(!testMode && claimed){
      const progress=await readJson(context.progressPath);
      if(progress.events.filter(e=>e.task==='FINALIZE'&&e.allowed).length>=RUN_POLICY.finalizeAttempts){
        try {result.failureNotification=await notifyFailure(context,{code:failureCode(step,error.message)});}
        catch {result.failureNotification={state:'QUEUE_FAILED',deliveryVerified:false};}
      }
    }
    await savePrivateJson(resultPath,result);
    return result;
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try {
    if(!option('--context')||!option('--input')||!option('--observations'))
      throw new Error('Use --context private-context.json --input private-draft.json --observations private-observations.json [--test]');
    const result=await finalizeAnalysisRun({contextPath:option('--context'),inputPath:option('--input'),
      observationsPath:option('--observations'),testMode:args.includes('--test'),archiveRoot:option('--archive-root')});
    console.log(JSON.stringify(result));if(!result.ok)process.exitCode=2;
  } catch(error){console.error(JSON.stringify({ok:false,error:error.message,publicationAttempted:false}));process.exitCode=2;}
}
