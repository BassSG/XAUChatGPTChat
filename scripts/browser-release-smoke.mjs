import { createRequire } from 'node:module';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fixtureReport } from './fixtures/desk-v4-fixture.mjs';
import {locationReport} from './fixtures/desk-v42-fixture.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.XAU_PLAYWRIGHT_PATH || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.XAU_BROWSER_CHANNEL?{channel:process.env.XAU_BROWSER_CHANNEL}:{})});
const output=resolve('.test-artifacts');await mkdir(output,{recursive:true});
const cases=[['v3',JSON.parse(await readFile('public/reports/archive/analysis-20260930-021055.json','utf8'))],['wait',fixtureReport()],['watch',fixtureReport(true)]];
for(const side of ['BUY','SELL'])for(const w of [false,true])cases.push(['v42-'+side.toLowerCase()+'-'+(w?'watch':'wait'),locationReport(side,w)]);
let passed=0;const results=[];
try{
  for(const [width,height]of [[1440,1000],[820,1180],[390,844]])for(const [name,report]of cases){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Only local application traffic is permitted; fixtures never leave this context.
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='127.0.0.1')return route.abort();
      if(url.pathname.endsWith('/reports/latest.json'))return route.fulfill({json:report});
      return route.continue();
    });
    await page.goto('http://127.0.0.1:4178/XAUChatGPTChat/#analysis');
    await page.locator('#report-title').filter({hasText:report.headline}).waitFor();
    if(name!=='v3'){
      assert.equal(await page.locator('.desk-brief').isVisible(),true);
      assert.equal(await page.locator('.desk-no-trade p').isVisible(),true);
      for(const key of ['xau','baseline','sr','amm','dxy','spdr','news','secondary','primary','alternative']){
        const details=page.locator('.desk-'+key);await details.locator('summary').click();assert.equal(await details.locator('p').isVisible(),true);
      }
      assert.equal(await page.locator('.desk-v4-error').count(),0);
    }else assert.equal(await page.locator('.desk-v4').count(),0);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    assert.equal(overflow,false,`${name} ${width} overflow`);
    await page.screenshot({path:resolve(output,`${name}-${width}.png`),fullPage:true});
    await page.goto('http://127.0.0.1:4178/XAUChatGPTChat/#scenario-plan');
    await page.locator('.sequence-card').first().waitFor({state:'visible'});
    if(width===390){
      await page.locator('#mobile-side-picker button').nth(1).click();
      assert.equal(await page.locator('.sequence-card').nth(1).isVisible(),true);
      assert.equal(await page.locator('.sequence-card').first().isVisible(),false);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
    if(name.startsWith('v42')){
      await page.goto('http://127.0.0.1:4178/XAUChatGPTChat/#overview');
      const host=page.locator(width===390?'#mobile-location':'#overview-location');
      await host.waitFor({state:'visible'});assert.match(await host.innerText(),/รอที่ไหน/);assert.match(await host.innerText(),/แผนหลัก/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
      await page.screenshot({path:resolve(output,`${name}-overview-${width}.png`),fullPage:false});
    }
    assert.deepEqual(errors,[]);results.push({name,width,result:'PASS'});passed++;await context.close();
  }
}finally{await browser.close();await writeFile(resolve(output,'browser-results.json'),JSON.stringify({passed,results},null,2));}
console.log(`Browser rendering: ${passed} passed / 0 failed (V3, legacy V4, V4.2 WAIT/WATCH × desktop/tablet/mobile)`);
