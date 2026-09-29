export function calendarUtc(raw) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw || '')) return null;
  const iso=raw.replace(' ','T')+'Z', t=Date.parse(iso);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,19)===iso.slice(0,19) ? t : null;
}
export function bangkok(t) { return new Date(t+7*3600000).toISOString().slice(0,19)+'+07:00'; }
export function calendarEvents(rows, now) {
  return rows.filter(r=>r.currency==='USD').map(r=>{
    const t=calendarUtc(r.date), future=t!==null && t>now;
    return {title:r.event,currency:r.currency,rawTime:r.date,at:t===null?null:bangkok(t),
      timezoneStatus:t===null?'UNVERIFIED':'UTC_DOCUMENTED',
      state:t===null?'UNVERIFIED':future?'UPCOMING':'UNVERIFIED',
      releaseStatus:t===null?'TIME_UNVERIFIED':future?'NOT_DUE':r.actual==null?'AWAITING_RELEASE':'PROVIDER_VALUE_NEEDS_VERIFICATION',
      providerActual:future||t===null?null:r.actual,forecast:r.estimate,previous:r.previous,
      impact:String(r.impact||'').toUpperCase(),unit:r.unit,
      sourceUrl:'https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar'};
  }).sort((a,b)=>(Date.parse(a.at)||Infinity)-(Date.parse(b.at)||Infinity));
}
