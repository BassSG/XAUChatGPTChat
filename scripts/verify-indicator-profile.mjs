import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {INDICATOR_PROFILE,validateIndicatorVerification} from '../src/indicator-profile.js';
import {requirePrivatePath} from './fmp-cache.mjs';
const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
if(!get('--input')||!get('--output'))throw new Error('Use --input observed-chart-verification.json --output private/indicator-verification.json [--source actual-exported-Pine.txt]');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(get('--output'));requirePrivatePath(out,repo);
const v=JSON.parse((await readFile(get('--input'),'utf8')).replace(/^\uFEFF/,''));
Object.assign(v,{profileId:INDICATOR_PROFILE.id,referenceFileSha256:INDICATOR_PROFILE.fileSha256,referenceCanonicalSha256:INDICATOR_PROFILE.canonicalSha256});
if(get('--source')){
  const source=(await readFile(get('--source'),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trimEnd()+'\n';
  v.chartSourceSha256=createHash('sha256').update(source).digest('hex');
  v.state=v.chartSourceSha256===INDICATOR_PROFILE.canonicalSha256?'EXACT_SOURCE_VERIFIED':'SOURCE_MISMATCH';
}
// Input file must represent a real UI read. This tool never fills defaults as observed Inputs.
validateIndicatorVerification(v,v.verifiedAt);
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(v,null,2)+'\n');
console.log(JSON.stringify({output:out,state:v.state,referenceVersion:INDICATOR_PROFILE.version,inputsRead:Object.keys(v.inputs||{}).length}));
