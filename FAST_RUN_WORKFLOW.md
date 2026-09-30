# XAU Desk — เริ่มรอบด้วยข้อมูลย่อ

ใช้กับ 09:00 / 14:30 / 19:00 เดิม ใช้ GPT-6.1 Sol Extra High (`gpt-6.1-sol`, `xhigh`) ตามคำขอผู้ใช้ล่าสุด นี่เป็นทางเข้ารอบงาน ไม่เปลี่ยนสัญญา V4 หรือเกณฑ์เผยแพร่

## 1. เริ่มครั้งเดียว

จาก repository นี้ รัน `node scripts/prepare-analysis-run.mjs` และอ่านผลย่อ มันสร้าง `context.json`, `carry-evidence.json`, ดัชนี journal และ progress ส่วนตัวนอก Git ไม่ต้องเปิดหรืออ่านประวัติทั้งแชท/สมุดบันทึกทั้งหมด

- อ่านไฟล์นี้ทุกรอบ หาก `contractsChanged:true` อ่าน SCHEDULE_WORKFLOW.md, V4_REASONING_CONTRACT.md, ANALYSIS_OPERATING_PLAN.md เพื่อรับกติกาที่เปลี่ยน หาก false ใช้สัญญาย่อนี้และเปิดรายละเอียดเฉพาะเมื่อจำเป็น ห้ามสำรวจ repository/รันชุดทดสอบทั้งระบบในรอบวิเคราะห์
- อ่าน context เฉพาะ baseline/carryLevels และรายการ prior plan ที่จะทบทวน `journal-index.json` มีตำแหน่งทุกแผน เปิด section ตามบรรทัดเมื่อจำเป็น ดัชนีเป็นตัวช่วยค้น ไม่ใช่ข้อสรุปผลเทรด
- ตรวจ inventory แท็บหนึ่งครั้ง ใช้แท็บ TradingView/Forex Factory/DXY/SPDR ที่เปิดอยู่ก่อน `browserHints` เป็น URL ช่วยหาเท่านั้น ตรวจ symbol และ provider จริงเสมอ สร้างแท็บเฉพาะที่ไม่มี ใช้ chart เดิมอ่าน H1/M15/M5 ต่อกัน ไม่แก้ saved layout ไม่เปิด chart ใหม่ทุกกรอบเวลา

## 2. เก็บหลักฐานที่จำเป็น

ลำดับหลัก **XAU HTF W1/D1/H4/H1 > Daily SR > AMM > M15 setup > M5 trigger > DXY filter**. Daily SR เป็นแผนที่ตำแหน่ง; AMM เป็นโซน refine ผ่าน HTF; EBW/All Indy เป็นการยืนยันรอง; DXY CONFIRM/NEUTRAL/CONTRADICT ไม่ trigger; SPDR เป็น flow ระยะกลาง; ข่าวเป็น regime/event-risk

- `CANDIDATE_NEEDS_CURRENT_H1` = ฐานกรอบใหญ่เดิมยังไม่หมดอายุและตรวจ hash หลักฐานแล้ว **ยังไม่ใช่การยืนยัน carry**. อ่าน H1 ปิดล่าสุด ตรวจ Critical Zone / structure shift / displacement+retest / post-news abnormal displacement ใหม่ก่อนใช้ หากฐานหมดอายุ ถูกพัก หรือหลักฐานเสีย ต้อง refresh. แค่ H1 checkedAt เดิมเก่าไม่จำเป็นต้องอ่าน W1/D1/H4 ใหม่ทั้งหมด
- carry-evidence เก็บเวลาและ OHLC เดิม ไม่เก็บ quote. รวม structural bars ที่จะใช้กับ observations ใหม่โดยคงเวลาแท่งเดิม; capturedAt ใหม่คือเวลาที่เก็บชุดหลักฐานรอบนี้จริง ต้องมี quote/H1/M15/M5 ที่อ่านใหม่แยกชัด ห้ามเปลี่ยนเวลาเก่าให้ดูสด
- ราคาหลัก PEPPERSTONE:XAUUSD เท่านั้น ตรวจ Data Window และเวลาปิด ไม่กะ OHLC จากภาพ ไม่ใช้ OANDA/FMPแทน. M15 เป็น setup/confirmation ขั้นต่ำ, M5 เป็น trigger/retest/fine entry. เก็บเพียง bars ที่พิสูจน์โครงสร้าง/เบรก/รีเทสต์; เพิ่มเมื่อจำเป็นจริง
- บันทึก observations ทุกกรอบที่สำเร็จด้วย `node scripts/record-analysis-evidence.mjs --input <observations.json>` ก่อนลองแก้ source/UI ให้รัน `node scripts/analysis-run-progress.mjs --context <context.json> --stage RETRY --source <PEPPERSTONE|FOREX_FACTORY|DXY|SPDR|EBW|PLAN_REVIEW>` เมื่อ retryAllowed=true ลองแก้ตรงจุดอีก **หนึ่งครั้ง**; false ให้เก็บข้อขาดและไปต่อ ห้ามวน panel/coordinate/reload หลายวิธีซ้ำไปมา Optional EBW ไม่บังคับให้หยุดรายงาน
- อ่าน Forex Factory ตาม Asia/Bangkok, DXY และข่าวสำคัญก่อนรอบถัดไป; เวลา future = UPCOMING ห้ามมี Actual. **ไม่รอให้ถึงเวลาประกาศ/รอแท่งอนาคตในรอบนี้**. ข่าวที่ยังไม่ออกให้ส่งแผนแบบมีเงื่อนไข/WAIT พร้อมความเสี่ยงก่อนข่าว ตรวจต้นทางเมื่อ Actual ขัดกันหรือยังไม่ถึงเวลา
- รัน `powershell.exe -NoProfile -File scripts/collect-fmp.ps1 -OutputPath <runDir/fmp.json> -Since <context.newsWindow.from> -Until <context.newsWindow.to>` หนึ่งครั้ง อ่าน summaryPath ที่คืนมาเฉพาะข่าวในช่วงที่เกี่ยวข้อง ไม่อ่านดิบทั้งไฟล์โดยไม่มีเหตุ; ไฟล์เต็มยังเก็บส่วนตัว. Cache calendar 5 นาที/news 10 นาที/Treasury 6 ชั่วโมง ใช้ fetchedAt/data date เดิมและ cacheStatus ไม่เรียกว่าดึงสดเมื่อ HIT. ไม่ carry calendar ข้ามเวลา release; ต้องการอ่านใหม่ใช้ `-ForceRefresh`. FMPเสริมเท่านั้น ไม่เปิด/พิมพ์ credential
- SPDR/yields ใช้ข้อมูลวันที่เดิมได้เมื่อระบุว่าเป็นบริบทตามวันนั้น ไม่อ้างว่าเป็น tick สด เปิดต้นทางเพื่ออัปเดตเท่าที่เข้าถึงได้ ไม่ค้นข่าวกว้างซ้ำเมื่อไม่มีประเด็นเกี่ยวข้อง

## 3. จบเป็นรายงานที่ใช้ได้

เป้าหมายเก็บหลัก 8 นาที/รายงานพร้อม 12 นาที เป็นงบการทำงาน **ไม่ใช่การรับประกันหรือข้ออนุญาตข้าม gate**. รัน `node scripts/analysis-run-progress.mjs --context <context.json> --stage PRIMARY` หลังอ่านราคาหลัก และ `--stage CONTEXT` หลังข่าว/บริบท เมื่อคืน FINALIZE_AVAILABLE ให้หยุดงานเสริมและทำรายงานจากสิ่งที่ยืนยันได้ Pages deploy อาจใช้เวลาเพิ่ม

- แยก WAIT zone กับ no-trade; consolidation midpoint, HTF/M15 conflict, spread, news embargo, extended entry, missing Stop, nearby opposing liquidity, missing evidence, low netR เป็นเหตุพักเข้าได้
- สูงสุด PRIMARY + ALTERNATIVE พร้อมเหตุผลโครงสร้างและเงื่อนไขเปลี่ยนแผน แยก entry/trigger failure/tactical/structural invalidation/actual Stop/re-baseline. Re-baseline ต้องพัก tactics เดิมและ historical levels
- Stop ตาม swing จริงก่อนคิด R; ไม่บีบ Stop เพื่อให้ R ผ่าน. ไม่มี entry+Stop+target ที่พิสูจน์ = ไม่มี R แต่งขึ้น. WATCH ต้องผ่าน freshness, observed M15 setup, costs/spread/news และ minimumNetR. ใช้ news embargo **จาก src/desk-policy.js เท่านั้น**. Quote ≤2 นาที, news check ≤15 นาที, publishing snapshot ≤15 นาที ตาม validator เดิม
- ใช้ schemaVersion 4 เดิมและ `node scripts/assemble-desk-report.mjs --input <draft.json> --output <report.json>` ใส่ทุกชั้น Bias/Phase/carry/HTF/SR/AMM/DXY/SPDR/news/entry/wait/no-trade/invalidation/trade/สรุป. decision แยก DATA_MISSING/SIGNAL_PENDING/STRUCTURE_PENDING/NEWS_RISK/MARKET_CLOSED/CONDITIONAL_PLAN ให้ตรงหลักฐาน WAIT ยังมีข่าว โครงสร้าง สิ่งเปลี่ยน และสิ่งที่รอยืนยัน ไม่จบแค่ WAIT
- snapshot/quote/scenario.asOf ต้องสอดคล้องจากชุด JSON เดียวกัน อย่าเปลี่ยน snapshot เก่าโดยคง quote/news/confirmation เก่า หากต้อง snapshot ใหม่ ตรวจ freshness ใหม่
- prior review เปิดเฉพาะ original report/review rules ที่จำเป็นและหลักฐาน Pepperstone ครบช่วง. ถ้าดึงไม่ได้หลัง retry ให้ตรวจไม่ได้/รอตรวจ พร้อมเวลา ไม่ยืดรอบเพื่อไล่ย้อนหลังไม่สิ้นสุด; ไม่คิด R เมื่อ entry/ลำดับ TP/SL ไม่ครบหรือกำกวม ไม่อ้างผลเทรดจริง
- อ่าน section journal ที่เกี่ยวข้องและอัปเดต `../../outputs/XAUUSD_Trading_Desk_Journal.md` ทุกแผนรวม WAIT/ผล review และเวลา/แหล่งหลักฐาน
- `node scripts/record-analysis-evidence.mjs --input <observations.json> --report <report.json>` แล้ว validate **ก่อน** PNG, `node scripts/render-analysis-image.mjs --input <report.json> --output <report.png>` เปิดภาพตรวจตัวเลข/ภาษา/ป้ายแผนผัง แล้ว `--stage READY`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/publish-report.ps1 -ReportPath <report.json> -ImagePath <report.png>` ตรวจ Pages + Worker latest หลัง deploy และบันทึกผล. `--stage PUBLISHED` เฉพาะเมื่อยืนยันสำเร็จ; ล้มเหลว `--stage FAILED` และรายงานตรงไปตรงมา. ส่งข้อความไทยและภาพเต็มใน Codex ทุกรอบ ไม่ใส่ broker/เขตเวลาใน headline/notification แต่เก็บ source/time จริงใน body/journal. ห้าม publish fixture/secret/ข้อมูลส่วนตัว

ไม่มี polling, terminal ที่ต้องเปิดค้าง หรือ background collector. progress เป็น one-shot สำหรับวัดเวลารอบจริงเท่านั้น ไม่คาดเดา token savings. เวลา/โมเดลตาม automation เดิม
