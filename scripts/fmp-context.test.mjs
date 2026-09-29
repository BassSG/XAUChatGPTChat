import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarUtc,bangkok,calendarEvents} from './fmp-context.mjs';
test('UTC calendar crosses Thai day and year exactly once',()=>{
 assert.equal(bangkok(calendarUtc('2026-12-31 18:00:00')),'2027-01-01T01:00:00+07:00');
 assert.equal(calendarUtc('2026-02-30 13:00:00'),null);
 assert.equal(calendarUtc('2026-09-29 13:00:00+07:00'),null);
});
test('future Actual is suppressed; actual zero stays zero but unverified',()=>{
 const rows=[{currency:'USD',event:'TEST',date:'2026-09-29 13:00:00',actual:0}];
 assert.equal(calendarEvents(rows,Date.parse('2026-09-29T12:00:00Z'))[0].providerActual,null);
 const past=calendarEvents(rows,Date.parse('2026-09-29T14:00:00Z'))[0];
 assert.equal(past.providerActual,0); assert.equal(past.state,'UNVERIFIED');
 rows[0].actual=null;
 assert.equal(calendarEvents(rows,Date.parse('2026-09-29T14:00:00Z'))[0].releaseStatus,'AWAITING_RELEASE');
});
