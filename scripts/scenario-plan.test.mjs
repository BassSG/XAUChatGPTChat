import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioSvg,validateScenarioPlan} from '../src/scenario-plan.js';
const make=()=>({snapshotAt:'2026-09-28T10:35:08+07:00',planId:'test',scenarioPlan:{symbol:'PEPPERSTONE:XAUUSD',asOf:'2026-09-28T10:35:08+07:00',scenarios:[{side:'BUY',breakFrame:'M15',retestFrame:'M5',breakPrice:4203.2,retestLow:4201.65,retestHigh:4203.2,breakState:'WAITING',confirmation:'รอปิดยืนยัน',invalidation:'ฐานเสีย',evidence:'ยอดแท่งปิด'}]}});
test('mixed timeframe diagram labels M15 break and M5 retest separately',()=>{
 const svg=scenarioSvg(make()); assert.match(svg,/M15 ปิดเหนือ 4203.20/); assert.match(svg,/M5 รีเทสต์ 4201.65–4203.20/); assert.match(svg,/เส้นทางสมมติ/); assert.match(svg,/ยังไม่เกิด/);
});
test('wrong source, mismatched time, future observed break and inverted zone are rejected',()=>{
 for(const mutate of [r=>r.scenarioPlan.symbol='OANDA:XAUUSD',r=>r.scenarioPlan.asOf='2026-09-27T10:35:08+07:00',r=>Object.assign(r.scenarioPlan.scenarios[0],{breakState:'OBSERVED',breakClosedAt:'2026-09-28T11:00:00+07:00'}),r=>r.scenarioPlan.scenarios[0].retestLow=4300]) {const r=make();mutate(r);assert.throws(()=>validateScenarioPlan(r));}
});
test('scenario text is XML escaped and missing scenarios preserve old reports',()=>{
 const r=make();r.scenarioPlan.scenarios[0].confirmation='<script>alert(1)</script>';assert.ok(!scenarioSvg(r).includes('<script>'));assert.equal(scenarioSvg({}),'');
});
