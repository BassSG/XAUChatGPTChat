import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateEvidencePack} from '../src/analysis-evidence.js';
import {derivePriceAction} from '../src/price-action.js';
import {requirePrivatePath} from './fmp-cache.mjs';
const args=process.argv.slice(2),get=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
if(!get('--evidence')||!get('--output'))throw new Error('Use --evidence observations.json --output private/context.json');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(get('--output'));requirePrivatePath(out,repo);
const pack=validateEvidencePack(JSON.parse((await readFile(get('--evidence'),'utf8')).replace(/^\uFEFF/,'')));
const wanted=(get('--frames')||'H1,M15').split(','),frames=Object.fromEntries(wanted.filter(f=>pack.frames[f]).map(f=>[f,pack.frames[f].slice(-64)]));
const observations=derivePriceAction(frames,pack.capturedAt);
const result={observedAt:pack.capturedAt,toolkit:{observations},method:'DESK_CLOSED_OHLC_V1',
  note:'คำนวณ pivot/FVG/EQH/EQL จากแท่งที่บันทึกเท่านั้น ไม่จำลอง proprietary AMM/Pine; EMA/OB/BOS/CHOCH ที่ไม่ได้อ่านยังขาด ต้องเพิ่มเฉพาะหลักฐานเกี่ยวกับโซนที่เลือก'};
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:out,observations:observations.length,frames:wanted,note:result.note}));
