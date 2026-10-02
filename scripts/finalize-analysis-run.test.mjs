import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {alignedDraft,alignedPack} from './fixtures/desk-v43-fixture.mjs';
import {assembleDeskReport} from '../src/desk-generation.js';
import {finalizeAnalysisRun,executeScript} from './finalize-analysis-run.mjs';
import {sha256} from './analysis-runtime.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function workspace(t,watch=false) {
  const runDir=await mkdtemp(join(tmpdir(),'xau-finalize-test-'));
  t.after(()=>rm(runDir,{recursive:true,force:true}));
  const now=Date.now(),draft=alignedDraft('SELL',watch,now),pack=alignedPack(assembleDeskReport(draft));
  const contextPath=join(runDir,'context.json'),inputPath=join(runDir,'draft.json'),observationsPath=join(runDir,'observations.json');
  await writeFile(contextPath,JSON.stringify({runDir,progressPath:join(runDir,'progress.json'),contractHash:'TEST ONLY'}));
  await writeFile(join(runDir,'progress.json'),JSON.stringify({startedAt:new Date(now).toISOString(),phase:'COLLECTING',events:[]}));
  await writeFile(inputPath,JSON.stringify(draft));await writeFile(observationsPath,JSON.stringify(pack));
  return {runDir,draft,pack,contextPath,inputPath,observationsPath,archiveRoot:join(runDir,'archive'),testMode:true};
}
for(const watch of [false,true]) test('private '+(watch?'WATCH':'WAIT')+' bundle really verifies evidence and renders PNG; reuse keeps it unchanged',async t=>{
  const s=await workspace(t,watch),publicPath=join(repo,'public/reports/latest.json');
  const originalHash=sha256(await readFile(publicPath));
  const scripts=[],execute=async(name,args,options)=>{scripts.push(name);return executeScript(name,args,options);};
  const first=await finalizeAnalysisRun({...s,execute});
  assert.equal(first.ok,true,first.error);
  assert.equal(first.publicationAttempted,false);assert.equal(first.imageNeedsInspection,true);assert.equal(first.journalRequired,true);
  const r=JSON.parse(await readFile(first.report,'utf8'));
  assert.equal(r.testOnly,true);assert.equal(r.dataClass,'TEST_FIXTURE');assert.equal(r.status,watch?'WATCH SELL':'WAIT');
  assert.equal(await readFile(first.body,'utf8'),r.body+'\n');
  assert.deepEqual([...await readFile(first.image)].slice(0,8),[137,80,78,71,13,10,26,10]);
  const second=await finalizeAnalysisRun({...s,execute});
  assert.equal(second.ok,true);assert.equal(second.reused,true);
  assert.deepEqual(first.hashes,second.hashes);
  assert.equal(scripts.filter(n=>n==='render-analysis-image.mjs').length,1);
  assert.equal(scripts.filter(n=>n==='verify-recorded-evidence.mjs').length,2);
  assert.equal(sha256(await readFile(publicPath)),originalHash);
});
test('fixtures cannot enter the production finalization path, and --test cannot silently mark real data as a fixture',async t=>{
  const s=await workspace(t);
  await assert.rejects(()=>finalizeAnalysisRun({...s,testMode:false}),/fixtures cannot finalize/i);
  delete s.draft.testOnly;delete s.draft.dataClass;await writeFile(s.inputPath,JSON.stringify(s.draft));
  await assert.rejects(()=>finalizeAnalysisRun(s),/requires an explicitly marked/);
});
test('an OHLC mismatch fails before image generation or any publication attempt',async t=>{
  const s=await workspace(t);s.pack.frames.M15.at(-1).close+=.001;
  await writeFile(s.observationsPath,JSON.stringify(s.pack));
  let calls=0;
  const result=await finalizeAnalysisRun({...s,execute:async()=>{calls++;}});
  assert.equal(result.ok,false);assert.equal(result.step,'EVIDENCE');assert.match(result.error,/differs|match/i);
  assert.equal(calls,0);assert.equal(result.publicationAttempted,false);
});
test('an unchanged invalid draft is not rerun; two changed failed attempts close the repair loop',async t=>{
  const s=await workspace(t),valid=structuredClone(s.draft);
  s.draft.desk.setup.timeframe='M5';await writeFile(s.inputPath,JSON.stringify(s.draft));
  let first=await finalizeAnalysisRun(s);assert.equal(first.ok,false);
  const repeated=await finalizeAnalysisRun(s);assert.match(repeated.error,/Unchanged failed input/);
  s.draft.waitFor+=' TEST CORRECTION';await writeFile(s.inputPath,JSON.stringify(s.draft));
  first=await finalizeAnalysisRun(s);assert.equal(first.ok,false);
  await writeFile(s.inputPath,JSON.stringify(valid));
  const third=await finalizeAnalysisRun(s);assert.equal(third.ok,false);assert.match(third.error,/TASK_ALREADY_ATTEMPTED/);
  const progress=JSON.parse(await readFile(join(s.runDir,'progress.json'),'utf8'));
  assert.equal(progress.events.filter(e=>e.task==='FINALIZE' && e.allowed).length,2);
});
test('reused images still pass current validation and an input-only change cannot bypass validation',async t=>{
  const s=await workspace(t);
  const first=await finalizeAnalysisRun(s);assert.equal(first.ok,true,first.error);
  const stale=await finalizeAnalysisRun({...s,execute:async(name)=>{
    if(name==='validate-report.mjs')throw new Error('TEST: snapshot is now stale');
    return {script:name,durationMs:1};
  }});
  assert.equal(stale.ok,false);assert.match(stale.error,/stale/);
  assert.equal(stale.publicationAttempted,false);
});
