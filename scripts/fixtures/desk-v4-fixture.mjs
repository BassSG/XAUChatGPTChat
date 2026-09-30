import { HIERARCHY } from '../../src/desk-v4.js';
import { DESK_POLICY } from '../../src/desk-policy.js';
import { assembleDeskReport } from '../../src/desk-generation.js';
// SYNTHETIC TEST DATA. Kept outside public/. Never an observation of the market.
export function fixtureDraft(watch = false, now = Date.now()) {
  const at = ms => new Date(ms+7*3600000).toISOString().replace('Z','+07:00');
  const snapshotAt=at(now-30000), hour=Math.floor((now-30000)/3600000)*3600000;
  const ref=(timeframe,closed=hour,bar={open:4281,high:4290,low:4278.5,close:4283})=>({symbol:'PEPPERSTONE:XAUUSD',timeframe,closedAt:at(closed),bar});
  const h1=ref('H1'), m15=ref('M15',Math.floor((now-30000)/900000)*900000),m5=ref('M5',Math.floor((now-30000)/300000)*300000);
  const base={W1:ref('W1',hour-86400000),D1:ref('D1',hour-86400000),H4:ref('H4',hour-14400000),H1:h1};
  const rule=condition=>({timeframe:'M15',condition});
  return {
    schemaVersion:4,testOnly:true,dataClass:'TEST_FIXTURE',snapshotAt,planId:watch?'TEST-V4-WATCH':'TEST-V4-WAIT',status:watch?'WATCH BUY':'WAIT',
    headline:'ตัวอย่างทดสอบ',summary:'ตัวอย่างทดสอบ',waitFor:watch?'รอ M5 รีเทสต์ตาม M15 ที่ยืนยันแล้ว และตรวจข่าวใหม่':'รอ M15 ยืนยันก่อน แล้วจึงตรวจ M5 รีเทสต์',validUntil:at(now+3600000),
    newsRisk:'ข้อมูลข่าวจำลองเพื่อทดสอบเท่านั้น',newsEvents:[],sources:[{name:'TEST ONLY — PEPPERSTONE:XAUUSD schema fixture',url:'https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD'}],
    dataQuality:{status:'OK',priceSource:'PEPPERSTONE:XAUUSD',priceAt:snapshotAt},
    evidence:{symbol:'PEPPERSTONE:XAUUSD',chartUrl:'https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD',observedAt:snapshotAt,marketState:'OPEN',spreadAssessment:'NORMAL',
      quote:{symbol:'PEPPERSTONE:XAUUSD',at:snapshotAt,bid:4281,ask:4281.12,spread:.12},
      bars:Object.fromEntries([h1,m15,m5].map(r=>[r.timeframe,{closedAt:r.closedAt,...r.bar}])),newsCheck:{status:'OK',checkedAt:snapshotAt,sourceUrl:'https://www.forexfactory.com/calendar'}},
    evidenceArchive:{sha256:'0'.repeat(64),capturedAt:snapshotAt,method:'DATA_WINDOW',counts:{H1:1,M15:1,M5:1}},
    indicatorContext:{status:'UNAVAILABLE',name:'EBW V10.4.4',symbol:'PEPPERSTONE:XAUUSD',summary:'ตัวอย่าง: อินดี้ไม่พร้อม แต่ประเมินโครงสร้างได้',frames:[]},
    planLevels:watch?{side:'BUY',entry:{low:4281,high:4282,reference:4282},stop:{kind:'FIXED_VERIFIED',price:4278,structurePrice:4278.5,structureAt:h1.closedAt,buffer:.5},targets:[{label:'TP1',price:4290}],costPerUnit:.2,costNote:'TEST: spread .12 + slippage .08',netR:1.86}:null,
    scenarioPlan:{symbol:'PEPPERSTONE:XAUUSD',asOf:snapshotAt,scenarios:[
      {role:'PRIMARY',side:'BUY',breakFrame:'M15',retestFrame:'M5',breakPrice:4282,retestLow:4281,retestHigh:4282,breakState:watch?'OBSERVED':'WAITING',...(watch?{breakClosedAt:m15.closedAt}:{}),structuralReason:watch?'โครงสร้างใหญ่ยกฐาน M15 ยืนยันแล้ว รอ M5':'โครงสร้างใหญ่ยกฐาน รอ M15 ยืนยัน',confirmation:'รอ M5 รีเทสต์และปิดเหนือ 4,282',invalidation:'M15 ปิดเสียฐาน ให้ยกเลิกฉาก',evidence:'SYNTHETIC TEST',levelEvidence:[m15]},
      {role:'ALTERNATIVE',side:'SELL',breakFrame:'M15',retestFrame:'M5',breakPrice:4278.5,retestLow:4278.5,retestHigh:4281,breakState:'WAITING',activateWhen:'REBASELINE_REQUIRED',transition:'ถ้า H1 ยอมรับต่ำกว่าฐาน ต้องประเมิน HTF ใหม่ก่อนเปิดแผนขาย',structuralReason:'ทางเลือกเมื่อโครงสร้างหลักเสีย',confirmation:'รอฐานใหม่และ M15 ยืนยันก่อนดู M5',invalidation:'กลับเข้าฐานเดิม ให้ยกเลิกฉาก',evidence:'SYNTHETIC TEST',levelEvidence:[h1]}]},
    desk:{policyId:DESK_POLICY.id,hierarchy:[...HIERARCHY],tacticalState:'ACTIVE',
      xauSummary:'ตัวอย่างทดสอบ: W1/D1/H4 ยกฐาน H1 พักตัว ไม่ใช่ข้อมูลตลาดจริง',entryIdea:'รอจุดเข้าจาก M15 แล้วใช้ M5 หาจังหวะละเอียด',
      conclusion:watch?'ตัวอย่าง WATCH: โครงสร้างและความเสี่ยงครบ รอ M5 ตามแผนหลัก':'ตัวอย่าง WAIT: ยังรอ M15 ยืนยันและ Stop ที่ตรวจได้',
      baseline:{id:'TEST-BASE',status:'ACTIVE',mode:'INITIAL',bias:'BUY',createdAt:at(hour-86400000),checkedAt:snapshotAt,refreshAt:at(now+86400000),refreshReason:'ตรวจ H1 ทุก snapshot และทบทวนเมื่อครบอายุหรือเสีย Critical Zone',invalidation:'H1 ยอมรับทะลุ Critical Zone',frames:Object.fromEntries(Object.entries(base).map(([f,r])=>[f,{structure:'ยกฐาน · ตัวอย่างทดสอบ',evidence:[r]}])),checkEvidence:[h1]},
      dailySR:{role:'LOCATION_MAP',summary:'พื้นที่โครงสร้าง ไม่ใช่สัญญาณเข้า',levels:[{id:'critical',type:'CRITICAL',status:'ACTIVE',low:4285,high:4290,evidence:[base.H4]},{id:'tactical',type:'TACTICAL',status:'TESTED',low:4278.5,high:4281,evidence:[h1]}]},
      amm:{role:'SCENARIO_REFINER',summary:'โซนที่ผู้วิเคราะห์สังเกต ใช้ปรับจังหวะภายใต้ HTF',zones:[{side:'BUY',low:4281,high:4282,status:'ACTIVE',method:'โซนจากแท่ง M15 ที่อ่านได้ — ตัวอย่าง',evidence:[m15]}]},
      phase:{name:'PULLBACK',location:'EDGE',reason:'กำลังพักตัวในแนวโน้มใหญ่ตามหลักฐานจำลอง'},
      setup:{timeframe:'M15',side:'BUY',status:watch?'CONFIRMED':'PENDING',priceLocation:'IN_ZONE',opposingLiquidity:'CLEAR',reason:watch?'M15 ปิดยืนยันเหนือระดับโครงสร้างแล้ว':'ยังไม่มี M15 ปิดยืนยันตามแผน',evidence:watch?[m15]:[]},
      trigger:{timeframe:'M5',state:'PENDING',condition:'M5 รีเทสต์หลัง M15 ยืนยัน แล้วปิดเหนือ 4,282'},
      waitZones:[{low:4281,high:4282,condition:'เมื่อราคาเข้าโซนค่อยตรวจ M15/M5',evidence:[m15]}],noTradeZones:[],
      invalidation:{triggerFailure:{timeframe:'M5',condition:'M5 รีเทสต์ไม่ผ่าน ให้รอใหม่'},tactical:rule('M15 เสียฐาน ให้พักฉากเดิม'),structural:{timeframe:'H1',condition:'H1 ยืนยันเสียฐานใหญ่'},rebaseline:{timeframe:'H1',condition:'H1 ยอมรับนอก Critical Zone ต้องตั้งฐานใหม่'},actualStop:watch?4278:null},
      dxy:{role:'CONFIRMATION_FILTER',state:'UNAVAILABLE',structure:'ยังไม่มีโครงสร้าง DXY ที่ตรวจได้',reason:'ไม่ใช้แทน trigger ทอง'},
      spdr:{role:'MEDIUM_TERM_FLOW',holdings:null,dailyChange:null,direction:'UNKNOWN',flowBias:'UNKNOWN',summary:'ยังไม่มีข้อมูล flow ระยะกลาง'},
      news:{role:'REGIME_EVENT_RISK',regime:'ตัวอย่างปฏิทินทดสอบ ไม่มีข่าวจริง',policyId:DESK_POLICY.id},
      risk:{stopBasis:'STRUCTURE_FIRST',stopEvidence:[h1],targetEvidence:[base.H4]},rebaseline:{state:'STABLE',signals:[],reasons:[]}
    }
  };
}
export const fixtureReport = (watch=false,now) => assembleDeskReport(fixtureDraft(watch,now));
