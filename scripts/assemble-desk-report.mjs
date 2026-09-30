import { readFile,writeFile } from 'node:fs/promises';
import { assembleDeskReport } from '../src/desk-generation.js';
const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
if(!get('--input')||!get('--output'))throw new Error('Use --input observed-draft.json --output report.json');
const draft=JSON.parse((await readFile(get('--input'),'utf8')).replace(/^\uFEFF/,''));
await writeFile(get('--output'),JSON.stringify(assembleDeskReport(draft),null,2)+'\n');
console.log('V4 report assembled; archive, validate, journal and publication gates still required.');
