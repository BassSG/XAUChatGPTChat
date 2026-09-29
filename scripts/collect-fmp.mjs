import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calendarEvents,bangkok} from './fmp-context.mjs';
const output=process.argv[process.argv.indexOf('--output')+1];
const key=process.env.FMP_API_KEY;
if(!process.argv.includes('--output')||!output||!key) { console.error('Output path and private FMP credential required.'); process.exit(1); }
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(output);
if(destination.toLowerCase().startsWith(repo.toLowerCase()+'/')||destination.toLowerCase().startsWith(repo.toLowerCase()+'\\')) throw new Error('Save FMP evidence outside the public repository');
const now=Date.now(), day=t=>new Date(t).toISOString().slice(0,10);
const routes={calendar:`economic-calendar?from=${day(now-86400000)}&to=${day(now+86400000)}`,treasury:`treasury-rates?from=${day(now-10*86400000)}&to=${day(now)}`,news:'news/forex-latest?page=0&limit=20'};
const results=await Promise.all(Object.entries(routes).map(async([name,route])=>{
  try {
    const response=await fetch('https://financialmodelingprep.com/stable/'+route+'&apikey='+encodeURIComponent(key),{signal:AbortSignal.timeout(15000),redirect:'error'});
    const data=await response.json();
    if(!response.ok||!Array.isArray(data)) return {name,status:'UNAVAILABLE',http:response.status};
    return {name,status:'OK',http:response.status,fetchedAt:new Date().toISOString(),data};
  } catch { return {name,status:'UNAVAILABLE',reason:'Request failed or timed out'}; }
}));
const rows=name=>results.find(r=>r.name===name)?.data||[];
const context={version:1,provider:'FMP',collectedAt:bangkok(Date.now()),usage:'SUPPLEMENT_ONLY',
  endpoints:results.map(({data,...meta})=>meta),
  calendar:calendarEvents(rows('calendar'),now),
  treasury:{frequency:'DAILY',rows:rows('treasury').sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,2)},
  news:rows('news').filter(r=>/gold|xau|dollar|fed|treasury|inflation/i.test([r.symbol,r.title].join(' '))).map(r=>({title:r.title,url:r.url,publisher:r.publisher,rawPublishedDate:r.publishedDate,timezoneStatus:'UNVERIFIED'})),
  cautions:['Verify calendar against Forex Factory and original release before marking Actual confirmed.','News timestamps have no verified offset; never assume UTC.','Treasury is daily context; not an M5 trigger.','Never replace Pepperstone candles, quotes, or plan levels.']};
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,JSON.stringify(context,null,2).replaceAll(key,'[REDACTED]'),'utf8');
console.log(JSON.stringify({saved:destination,endpoints:context.endpoints,usdEvents:context.calendar.length,relevantNews:context.news.length}));
