import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceRoute } from '../src/workspace-desk.js';

test('desktop and tablet links open the intended page and subview', () => {
  for (const [hash, page, view] of [
    ['#overview', 'overview', 'home'],
    ['#analysis', 'plan', 'conditions'],
    ['#scenario-plan', 'plan', 'sequence'],
    ['#indicator-card', 'plan', 'evidence'],
    ['#plan-image', 'plan', 'image'],
    ['#report-body', 'plan', 'full'],
    ['#news', 'news', 'news'],
    ['#market-chart', 'chart', 'live'],
    ['#chart', 'chart', 'snapshot'],
    ['#history', 'history', 'history'],
    ['#notifications', 'settings', 'settings']
  ]) assert.deepEqual(workspaceRoute(hash), { page, view });
});

test('unknown fragments safely return to overview', () => {
  for (const hash of ['', '#missing', '#constructor', '#__proto__']) {
    assert.deepEqual(workspaceRoute(hash), { page: 'overview', view: 'home' });
  }
});
