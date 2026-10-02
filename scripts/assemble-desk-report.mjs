import { readFile,writeFile } from 'node:fs/promises';
import { assembleDeskReport } from '../src/desk-generation.js';
import {compareDeskReports} from '../src/desk-comparison.js';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requirePrivatePath} from './fmp-cache.mjs';
const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
if(!get('--input')||!get('--output'))throw new Error('Use --input observed-draft.json --output report.json');
requirePrivatePath(resolve(get('--output')),resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const draft=JSON.parse((await readFile(get('--input'),'utf8')).replace(/^\uFEFF/,''));
if(draft.desk?.architectureVersion!=='4.3'&&!args.includes('--legacy'))throw new Error('New analysis must use architectureVersion 4.3 and source alignment. --legacy is only for explicit historical/fixture compatibility.');
let report=assembleDeskReport(draft);
if(get('--previous')){
  const previous=JSON.parse((await readFile(get('--previous'),'utf8')).replace(/^\uFEFF/,''));
  report.comparison=compareDeskReports(previous,report);report.changeSinceLast=report.comparison.reason;
  report=assembleDeskReport(report);
}
await writeFile(get('--output'),JSON.stringify(report,null,2)+'\n');
console.log('V4 report assembled; archive, validate, journal and publication gates still required.');
