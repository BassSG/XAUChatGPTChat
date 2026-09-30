import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {recordRunStage,savePrivateJson,acknowledgeContracts} from './analysis-runtime.mjs';
import {requirePrivatePath} from './fmp-cache.mjs';
const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const path=option('--context'),stage=option('--stage');
if(!path || !['PRIMARY','CONTEXT','READY','PUBLISHED','FAILED','RETRY'].includes(stage)) throw new Error('Use --context private-context.json --stage PRIMARY|CONTEXT|READY|PUBLISHED|FAILED|RETRY [--source PEPPERSTONE|FOREX_FACTORY|DXY|SPDR|EBW|PLAN_REVIEW]');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');requirePrivatePath(path,repo);
const c=JSON.parse(await readFile(path,'utf8'));requirePrivatePath(c.progressPath,repo);
const progress=JSON.parse(await readFile(c.progressPath,'utf8')),now=Date.now();
const event=recordRunStage(progress,stage,now,option('--source'));
await savePrivateJson(c.progressPath,progress);
if(stage==='READY') {requirePrivatePath(resolve(c.runDir,'../../startup-state.json'),repo);await acknowledgeContracts(c);}
console.log(JSON.stringify({...event,progressPath:c.progressPath}));
