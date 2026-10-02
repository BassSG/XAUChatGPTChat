import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {requirePrivatePath} from './fmp-cache.mjs';
import {normalizeSpdrHistory,SPDR_ARCHIVE,SPDR_SOURCE} from '../src/spdr-history.js';
import {spdrFlow} from '../src/desk-enrichment.js';
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(args.includes('--output')?arg('--output'):resolve(repo,'../../outputs/desk-runtime/spdr-history.json'));
requirePrivatePath(output,repo);await mkdir(dirname(output),{recursive:true});
const checkedAt=new Date(Date.now()+7*3600000).toISOString().replace('Z','+07:00');
let cached=null,cachedFlow=null;
try{cached=JSON.parse(await readFile(output,'utf8'));if(!Array.isArray(cached.history)||!cached.history.length)throw new Error('empty cache');cachedFlow=spdrFlow(cached.history,checkedAt);if(cached.downloadUrl!==SPDR_ARCHIVE||Date.parse(cached.checkedAt)>Date.parse(checkedAt)||!Number.isFinite(Date.parse(cached.checkedAt)))cached=null;}catch{cached=null;}
const age=cached?Date.parse(checkedAt)-Date.parse(cached.checkedAt):Infinity;
if(age<6*3600000&&!args.includes('--force-refresh')&&!args.includes('--input-xlsx')){
  console.log(JSON.stringify({state:cachedFlow.state,cacheStatus:'HIT',checkedAt:cached.checkedAt,dataDate:cached.history.at(-1)?.dataDate,observations:cached.history.length,output}));
}else{
  try{
    const xlsx=args.includes('--input-xlsx')?resolve(arg('--input-xlsx')):join(dirname(output),'spdr-gld-history.xlsx');
    requirePrivatePath(xlsx,repo);
    if(!args.includes('--input-xlsx')){
      const response=await fetch(SPDR_ARCHIVE,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('SPDR HTTP '+response.status);
      const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>12*1024*1024||bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('SPDR archive format/size changed');
      await writeFile(xlsx,bytes);
    }
    const candidates=[process.env.XAU_PYTHON_PATH,join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),'python3','python'].filter(Boolean);
    let extracted,lastError;
    for(const python of candidates){try{extracted=JSON.parse(execFileSync(python,[fileURLToPath(new URL('./read-spdr-history.py',import.meta.url)),xlsx],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,windowsHide:true,stdio:['ignore','pipe','pipe']}));break;}catch(e){lastError=e.code;if(e.code!=='ENOENT')break;}}
    if(!extracted)throw new Error('SPDR read-only Python extraction unavailable: '+lastError);
    const history=normalizeSpdrHistory(extracted,checkedAt),flow=spdrFlow(history,checkedAt);
    if(!history.length)throw new Error('SPDR archive has no holdings within 35 days');
    const value={version:1,state:flow.state,checkedAt,sourceUrl:SPDR_SOURCE,downloadUrl:SPDR_ARCHIVE,
      archiveSha256:createHash('sha256').update(await readFile(xlsx)).digest('hex'),columns:{date:extracted.dateHeader,holdings:extracted.holdingsHeader},history,flow};
    await writeFile(output,JSON.stringify(value,null,2)+'\n');
    console.log(JSON.stringify({state:value.state,cacheStatus:args.includes('--input-xlsx')?'LOCAL_ARCHIVE_READ':'MISS',checkedAt,dataDate:history.at(-1).dataDate,observations:history.length,columns:value.columns,output}));
  }catch(error){
    if(cached&&age<=7*86400000)console.log(JSON.stringify({state:cachedFlow.state,cacheStatus:'STALE_FALLBACK',checkedAt:cached.checkedAt,dataDate:cached.history.at(-1)?.dataDate,observations:cached.history.length,reason:error.message,output}));
    else{console.log(JSON.stringify({state:'UNAVAILABLE',cacheStatus:'ERROR',history:[],reason:error.message,output:null}));process.exitCode=1;}
  }
}
