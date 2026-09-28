import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileRoute } from '../src/mobile-desk.js';

test('existing report and chart deep links select the correct mobile page', () => {
  assert.deepEqual(mobileRoute('#scenario-plan'), {page:'plan',view:'sequence'});
  assert.deepEqual(mobileRoute('#analysis'), {page:'plan',view:'conditions'});
  assert.deepEqual(mobileRoute('#chart'), {page:'chart',view:'snapshot'});
  assert.deepEqual(mobileRoute('#market-chart'), {page:'chart',view:'live'});
});
test('all report details and settings remain reachable as distinct destinations', () => {
  for (const [hash, view] of [['plan-image','image'],['indicator-card','evidence'],['report-body','full']]) {
    assert.deepEqual(mobileRoute('#'+hash),{page:'plan',view});
  }
  for (const [hash,page] of [['news','news'],['history','history'],['notifications','settings']]) {
    assert.deepEqual(mobileRoute('#'+hash),{page,view:''});
  }
});
test('unknown or inherited hash keys fall back to home without breaking navigation', () => {
  for (const hash of ['', '#missing', '#constructor', '#__proto__']) assert.deepEqual(mobileRoute(hash),{page:'home',view:''});
});
