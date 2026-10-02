import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_REPORT_BYTES, readReportRequest } from '../worker/src/report-request.js';
const req=(body,headers={})=>new Request('https://example.test/api/admin/reports',{method:'POST',body,headers});

test('V4.3 production JSON fits the bounded upload without discarding evidence',async()=>{
  const report=JSON.parse(await readFile(new URL('../public/reports/latest.json',import.meta.url),'utf8'));
  const body=JSON.stringify(report),bytes=new TextEncoder().encode(body).length;
  assert.ok(bytes<=MAX_REPORT_BYTES);
  assert.deepEqual(await readReportRequest(req(body,{'Content-Length':String(bytes)})),report);
});
test('an upload above the old 100 KB ceiling retains Thai text and evidence',async()=>{
  const report={summary:'วิเคราะห์ทอง',evidence:'ก'.repeat(40_000)},body=JSON.stringify(report);
  assert.ok(new TextEncoder().encode(body).length>100_000);
  assert.deepEqual(await readReportRequest(req(body)),report);
});
test('declared oversize is rejected before parsing',async()=>{
  await assert.rejects(readReportRequest(req('{}',{'Content-Length':String(MAX_REPORT_BYTES+1)})),{status:413});
});
test('actual UTF-8 byte limit cannot be bypassed by missing or understated headers',async()=>{
  const body=JSON.stringify({body:'ก'.repeat(90_000)});
  for(const headers of [{},{'Content-Length':'2'}])await assert.rejects(readReportRequest(req(body,headers)),{status:413});
});
test('the exact byte boundary is accepted and malformed JSON remains invalid',async()=>{
  const body=JSON.stringify({body:'a'.repeat(MAX_REPORT_BYTES-11)});
  assert.equal(new TextEncoder().encode(body).length,MAX_REPORT_BYTES);
  assert.equal((await readReportRequest(req(body))).body.length,MAX_REPORT_BYTES-11);
  assert.equal(await readReportRequest(req('{invalid')),null);
});
