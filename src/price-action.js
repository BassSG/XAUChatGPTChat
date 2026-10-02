// Explicit desk definitions, not a reimplementation of proprietary AMM/Pine.
const milliseconds={M5:300000,M15:900000,H1:3600000,H4:14400000,D1:86400000,W1:604800000};
export function orderedClosed(refs,frame){
  return refs.length>0&&refs.every((r,i)=>r.symbol==='PEPPERSTONE:XAUUSD'&&r.timeframe===frame&&
    r.bar&&['open','high','low','close'].every(k=>Number.isFinite(r.bar[k])&&r.bar[k]>0)&&
    r.bar.high>=Math.max(r.bar.open,r.bar.close)&&r.bar.low<=Math.min(r.bar.open,r.bar.close)&&
    Number.isFinite(Date.parse(r.closedAt))&&(!i || Date.parse(r.closedAt)-Date.parse(refs[i-1].closedAt)===milliseconds[frame]));
}
export function confirmedSwing(refs,side){
  if(!Array.isArray(refs)||refs.length!==5||!orderedClosed(refs,refs[0]?.timeframe))return false;
  const key=side==='SELL'?'high':'low',v=refs[2].bar[key];
  return refs.every((r,i)=>i===2||(side==='SELL'?r.bar[key]<v:r.bar[key]>v));
}
export function derivePriceAction(frames,observedAt,{equalTolerance=.0012}={}){
  const items=[];
  for(const [frame,bars]of Object.entries(frames)){
    if(!milliseconds[frame])continue;
    const refs=bars.map(b=>({symbol:'PEPPERSTONE:XAUUSD',timeframe:frame,closedAt:b.closedAt,bar:{open:b.open,high:b.high,low:b.low,close:b.close}}));
    const add=(name,value,evidence,reason,parameters={})=>items.push({id:`${name}:${frame}:${evidence.at(-1).closedAt}`,name,state:'OBSERVED',symbol:'PEPPERSTONE:XAUUSD',timeframe:frame,observedAt,method:'DESK_CLOSED_OHLC_V1',parameters,value,evidence,reason});
    for(let i=4;i<refs.length;i++){
      const group=refs.slice(i-4,i+1);
      for(const side of ['BUY','SELL'])if(confirmedSwing(group,side))add(side==='SELL'?'SWING_HIGH':'SWING_LOW',{side,price:group[2].bar[side==='SELL'?'high':'low'],pivotAt:group[2].closedAt},group,'ยืนยัน pivot ด้วยแท่งซ้าย 2 / ขวา 2 ที่ปิดแล้ว',{left:2,right:2});
    }
    for(let i=2;i<refs.length;i++){
      const group=refs.slice(i-2,i+1);if(!orderedClosed(group,frame))continue;
      const [a,,c]=group.map(r=>r.bar);
      if(c.low>a.high)add('FVG',{side:'BUY',low:a.high,high:c.low},group,'ช่องว่าง wick สามแท่งที่ปิดแล้ว; ยังไม่รับรองว่าโซน fresh หรือเป็น Pine FVG');
      if(c.high<a.low)add('FVG',{side:'SELL',low:c.high,high:a.low},group,'ช่องว่าง wick สามแท่งที่ปิดแล้ว; ยังไม่รับรองว่าโซน fresh หรือเป็น Pine FVG');
    }
    const swings=items.filter(o=>o.timeframe===frame&&['SWING_HIGH','SWING_LOW'].includes(o.name));
    for(const name of ['SWING_HIGH','SWING_LOW']){
      const pair=swings.filter(o=>o.name===name).slice(-2);if(pair.length<2)continue;
      const values=pair.map(o=>o.value.price),diff=Math.abs(values[1]-values[0])/Math.max(...values);
      if(diff<=equalTolerance){const evidence=[...new Map(pair.flatMap(o=>o.evidence).map(r=>[r.closedAt,r])).values()].sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt));
        add(name==='SWING_HIGH'?'EQH':'EQL',{low:Math.min(...values),high:Math.max(...values)},evidence,'สอง confirmed pivots ใกล้กันตาม tolerance; liquidity context เท่านั้น',{tolerance:equalTolerance});}
    }
  }
  return items;
}
