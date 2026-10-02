export const SPDR_SOURCE = 'https://www.spdrgoldshares.com/usa/gld/';
export const SPDR_ARCHIVE = 'https://api.spdrgoldshares.com/api/v1/historical-archive?exchange=NYSE&lang=en&product=gld';
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const day=86400000;
export function spdrDate(value,date1904=false){
  const raw=String(value??'').trim();let result;
  const named=/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw);
  if(named){const m=months.indexOf(named[2].toLowerCase());if(m<0)throw new Error('Unknown SPDR month');result=`${named[3]}-${String(m+1).padStart(2,'0')}-${named[1].padStart(2,'0')}`;}
  else if(/^\d{4}-\d\d-\d\d$/.test(raw))result=raw;
  else if(/^\d+(\.0+)?$/.test(raw)){
    const serial=Number(raw);if(serial<61||serial>80000)throw new Error('Invalid Excel date serial');
    result=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+serial*day).toISOString().slice(0,10);
  }else throw new Error('Ambiguous/missing SPDR date');
  const parsed=Date.parse(result);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==result)throw new Error('Invalid SPDR calendar date');
  return result;
}
export function normalizeSpdrHistory(extracted,checkedAt,{days=35}={}){
  if(extracted.dateHeader!=='Date'||extracted.holdingsHeader!=='Tonnes of Gold'||!Array.isArray(extracted.rows))throw new Error('SPDR column/unit contract changed');
  if(!/(?:Z|[+-]\d\d:\d\d)$/.test(checkedAt||'')||!Number.isFinite(Date.parse(checkedAt)))throw new Error('SPDR checkedAt / explicit timezone required');
  const dates=new Map(),today=checkedAt.slice(0,10),from=Date.parse(today)-days*day;
  for(const row of extracted.rows){
    const dataDate=spdrDate(row.date,extracted.date1904);
    if(dataDate>today)throw new Error('SPDR future data date; check source/date interpretation');
    if(Date.parse(dataDate)<from)continue;
    // The official archive includes non-trading US holidays. They are missing
    // observations, not zero holdings or a copied previous value.
    if(/^(?:US Holiday|N\/A)$/i.test(String(row.holdings??'').trim())||row.holdings==null||String(row.holdings).trim()==='')continue;
    const holdings=typeof row.holdings==='number'?row.holdings:Number(String(row.holdings).replace(/,/g,''));
    if(!Number.isFinite(holdings)||holdings<=0)throw new Error('SPDR missing/non-positive tonnes; never substitute zero');
    if(dates.has(dataDate)&&dates.get(dataDate).holdings!==holdings)throw new Error('Conflicting same-date SPDR holdings');
    dates.set(dataDate,{dataDate,holdings:Number(holdings.toFixed(3)),checkedAt,sourceUrl:SPDR_SOURCE});
  }
  return [...dates.values()].filter(r=>Date.parse(r.dataDate)>=from).sort((a,b)=>a.dataDate.localeCompare(b.dataDate));
}
