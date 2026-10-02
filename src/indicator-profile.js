// Reference defaults from the user-supplied Pine file. Defaults are NOT observed chart inputs.
export const INDICATOR_PROFILE = Object.freeze({
  id:'EBW_V10_4_4_FIX1', version:'V10.4.4 Fix 1',
  title:'All Indy (EBW) V10.4.4 • Clean + Stochastic + RSI • Fix 1',
  fileSha256:'9449f87a12d8414f6f5ea751cc1e18977c4a1a2dc596f3082941364e9702fa80',
  canonicalSha256:'dca2f6ae1a6314bb5e152e6bcd689732cf21b8fec27cab2383f8c29487b4ffc4',
  defaults:{combo_kLength:14,combo_kSmooth:3,combo_dLength:3,combo_rsiLength:14,
    i_htfFilter:true,i_costTicks:0,lp_view:'Confirmation',lp_tf1:'60',lp_tf2:'240',lp_tf3:'1D',
    s_tfMode:'Intraday standard',z_refresh:'Closed bars',z_swingLen:5,z_breakMode:'Close'},
  note:'Pine เริ่มต้น Stochastic 14-3-3; toolkit ต้นฉบับกล่าวถึง 9-3-3 แยกกัน ต้องอ่าน Inputs จริง ไม่เปลี่ยนค่าเงียบ ๆ. Confirmation ปิด Limit Planner. costTicks=0 ไม่ได้จำลองต้นทุน.'
});
export const VERIFICATION_STATES=['UNAVAILABLE','NAME_ONLY','INPUTS_VERIFIED','EXACT_SOURCE_VERIFIED','SOURCE_MISMATCH'];
export function sameIndicatorChart(a,b){
  try{const left=new URL(a),right=new URL(b);return left.hostname.replace(/^www\./,'')===right.hostname.replace(/^www\./,'')&&left.pathname.replace(/\/$/,'')===right.pathname.replace(/\/$/,'');}catch{return false;}
}
export function validateIndicatorVerification(v,at){
  const ok=(c,m)=>{if(!c)throw new Error('Indicator verification: '+m);};
  ok(v&&VERIFICATION_STATES.includes(v.state)&&typeof v.reason==='string'&&v.reason.trim(),'state/reason');
  if(v.state==='UNAVAILABLE'){ok(!v.inputs&&!v.chartSourceSha256,'missing source must stay missing');return;}
  ok(v.profileId===INDICATOR_PROFILE.id&&v.referenceFileSha256===INDICATOR_PROFILE.fileSha256,'reference identity');
  ok(v.symbol==='PEPPERSTONE:XAUUSD'&&/^https:\/\/(www\.)?tradingview\.com\/chart\//.test(v.chartUrl||''),'chart binding');
  const t=Date.parse(v.verifiedAt);
  ok(/(?:Z|[+-]\d\d:\d\d)$/.test(v.verifiedAt||'')&&Number.isFinite(t)&&t<=Date.parse(at),'verification timestamp with explicit timezone');
  if(['INPUTS_VERIFIED','EXACT_SOURCE_VERIFIED'].includes(v.state)){
    ok(Date.parse(at)-t<=7*86400000,'Inputs verification expired; inspect once again');
    ok(v.inputs&&Object.keys(INDICATOR_PROFILE.defaults).every(k=>Object.hasOwn(v.inputs,k)&&typeof v.inputs[k]===typeof INDICATOR_PROFILE.defaults[k]),'all critical Inputs must actually be read');
    ok(['combo_kLength','combo_rsiLength'].every(k=>Number.isInteger(v.inputs[k])&&v.inputs[k]>=1&&v.inputs[k]<=200)&&['combo_kSmooth','combo_dLength'].every(k=>Number.isInteger(v.inputs[k])&&v.inputs[k]>=1&&v.inputs[k]<=50)&&Number.isInteger(v.inputs.z_swingLen)&&v.inputs.z_swingLen>=2&&v.inputs.z_swingLen<=30&&Number.isFinite(v.inputs.i_costTicks)&&v.inputs.i_costTicks>=0&&v.inputs.i_costTicks<=100000,'numeric Inputs match actual Pine bounds');
    ok(['Limit Planner','Confirmation','Both'].includes(v.inputs.lp_view)&&['Intraday standard','Adaptive','Legacy fixed'].includes(v.inputs.s_tfMode)&&['Closed bars','Live preview'].includes(v.inputs.z_refresh)&&['Close','Wick'].includes(v.inputs.z_breakMode),'Inputs enum values match actual Pine');
    ok(['lp_tf1','lp_tf2','lp_tf3'].every(k=>/^(?:[1-9]\d{0,3}|[1-9]\d?[SMWD]|[SMWD])$/.test(v.inputs[k])),'actual planning timeframe Inputs');
  }
  if(v.state==='EXACT_SOURCE_VERIFIED')ok(v.chartSourceSha256===INDICATOR_PROFILE.canonicalSha256&&v.referenceCanonicalSha256===INDICATOR_PROFILE.canonicalSha256,'exact match needs actual source hash and Inputs');
  if(v.state==='SOURCE_MISMATCH')ok(v.referenceCanonicalSha256===INDICATOR_PROFILE.canonicalSha256&&/^[a-f0-9]{64}$/.test(v.chartSourceSha256||'')&&v.chartSourceSha256!==INDICATOR_PROFILE.canonicalSha256,'mismatch requires observed source hash against the actual reference');
  if(v.state==='NAME_ONLY')ok(!v.inputs&&!v.chartSourceSha256,'name alone does not verify Inputs or source');
}
