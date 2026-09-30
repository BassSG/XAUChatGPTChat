import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calendarEvents,bangkok,compactFmpContext} from './fmp-context.mjs';
import {nextScheduledAt} from './analysis-runtime.mjs';
import {collectFmpEndpoint,requirePrivatePath} from './fmp-cache.mjs';
const output=process.argv[process.argv.indexOf('--output')+1];
const key=process.env.FMP_API_KEY;
if(!process.argv.includes('--output')||!output||!key) { console.error('Output path and private FMP credential required.'); process.exit(1); }
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(output);
requirePrivatePath(destination,repo);
const cacheOption=process.argv.indexOf('--cache-root');
const cacheRoot=resolve(cacheOption>=0?process.argv[cacheOption+1]:resolve(repo,'../../outputs/desk-runtime/fmp-cache'));
const force=process.argv.includes('--force-refresh');
const now=Date.now(), day=t=>new Date(t).toISOString().slice(0,10);
const value=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
const parseWindow=value=>/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value||'')?Date.parse(value):NaN;
const since=value('--since')?parseWindow(value('--since')):now-12*3600000;
const until=value('--until')?parseWindow(value('--until')):nextScheduledAt(now);
if(!Number.isFinite(since)||!Number.isFinite(until)||until<since) throw new Error('Use explicit ISO offsets for supplemental news window');
const routes={calendar:`economic-calendar?from=${day(Math.min(since,now)-86400000)}&to=${day(until+86400000)}`,treasury:`treasury-rates?from=${day(now-10*86400000)}&to=${day(now)}`,news:'news/forex-latest?page=0&limit=20'};
const results=await Promise.all(Object.entries(routes).map(([name,route])=>collectFmpEndpoint({name,route,key,cacheRoot,repo,now,force})));
const rows=name=>results.find(r=>r.name===name)?.data||[];
const context={version:1,provider:'FMP',collectedAt:bangkok(Date.now()),usage:'SUPPLEMENT_ONLY',
  endpoints:results.map(({data,...meta})=>meta),
  calendar:calendarEvents(rows('calendar'),now),
  treasury:{frequency:'DAILY',rows:rows('treasury').sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,2)},
  news:rows('news').filter(r=>/gold|xau|dollar|fed|treasury|inflation/i.test([r.symbol,r.title].join(' '))).map(r=>({title:r.title,url:r.url,publisher:r.publisher,rawPublishedDate:r.publishedDate,timezoneStatus:'UNVERIFIED'})),
  cautions:['Verify calendar against Forex Factory and original release before marking Actual confirmed.','News timestamps have no verified offset; never assume UTC.','Treasury is daily context; not an M5 trigger.','Never replace Pepperstone candles, quotes, or plan levels.']};
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,JSON.stringify(context,null,2).replaceAll(key,'[REDACTED]'),'utf8');
const summaryPath=destination+'.summary.json';
const summary=compactFmpContext(context,since,until);
await writeFile(summaryPath,JSON.stringify(summary,null,2).replaceAll(key,'[REDACTED]'),'utf8');
console.log(JSON.stringify({saved:destination,summaryPath,endpoints:context.endpoints,usdEvents:summary.calendar.length,relevantNews:summary.news.length,scope:summary.scope}));
