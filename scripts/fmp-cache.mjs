import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {RUN_POLICY} from '../src/run-policy.js';
import {bangkok,calendarUtc} from './fmp-context.mjs';

export function requirePrivatePath(path, repo) {
  const rel = relative(resolve(repo), resolve(path));
  if (!rel || (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && rel !== '..' && !isAbsolute(rel))) {
    throw new Error('Runtime evidence/cache must stay outside the public repository');
  }
}
export function usableCache(entry, name, now) {
  const at = Date.parse(entry?.fetchedAt);
  return entry?.version === 1 && entry.name === name && Array.isArray(entry.data) &&
    Number.isFinite(at) && now >= at && now - at < RUN_POLICY.fmpTtlMs[name] &&
    entry.thaiDay === bangkok(now).slice(0,10) &&
    !(name==='calendar' && entry.data.some(row => {const release=calendarUtc(row.date);return release!==null && release>at && release<=now;}));
}
export async function collectFmpEndpoint({name, route, key, cacheRoot, repo, now = Date.now(), fetchImpl = fetch, force = false}) {
  requirePrivatePath(cacheRoot, repo);
  if (!Object.hasOwn(RUN_POLICY.fmpTtlMs, name)) throw new Error('Unknown FMP cache endpoint');
  const path = join(cacheRoot, name + '.json');
  let cached;
  try { cached = JSON.parse(await readFile(path, 'utf8')); } catch { /* Cache miss/corruption: fetch once. */ }
  if (!force && usableCache(cached, name, now) && (name!=='calendar' || cached.route===route)) {
    return {name, status:'OK', http:200, fetchedAt:cached.fetchedAt, cacheStatus:'HIT', ageSeconds:Math.floor((now-Date.parse(cached.fetchedAt))/1000), data:cached.data};
  }
  try {
    const response = await fetchImpl('https://financialmodelingprep.com/stable/' + route + '&apikey=' + encodeURIComponent(key), {signal:AbortSignal.timeout(15000), redirect:'error'});
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) return {name,status:'UNAVAILABLE',http:response.status,cacheStatus:'MISS'};
    // The fetch start time is conservative; never refresh a reused observation timestamp.
    const fetchedAt = new Date(now).toISOString();
    const entry = {version:1, name, route, thaiDay:bangkok(now).slice(0,10), fetchedAt, data};
    await mkdir(cacheRoot, {recursive:true});
    const temporary = path + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(entry).replaceAll(key,'[REDACTED]'), 'utf8');
    await rename(temporary, path);
    return {name,status:'OK',http:response.status,fetchedAt,cacheStatus:'MISS',ageSeconds:0,data};
  } catch {
    // An expired response is not a successful current observation, even during an outage.
    return {name,status:'UNAVAILABLE',cacheStatus:'MISS',reason:'Request or private cache write failed; no stale result promoted'};
  }
}
