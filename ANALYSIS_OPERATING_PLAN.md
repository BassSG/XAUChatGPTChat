# XAU Desk — แบบแผนการวิเคราะห์และความเสถียร

## Current V4.3 source and location alignment

New runs follow [V4_3_SOURCE_ALIGNMENT.md](V4_3_SOURCE_ALIGNMENT.md), building on [V4_2_LOCATION_CONTRACT.md](V4_2_LOCATION_CONTRACT.md). Use schemaVersion 4 / architectureVersion "4.3" / policy XAU_V4_2. Scan above/current/below; verify actual Pine/source/Inputs and relevant confluence; select appropriate M15 then M5; preserve useful WAIT planning and dated DXY/SPDR/news. New explicit reviewRules V3 supports the scenario selected at publication. V4.2 manual-review and original V4 PRIMARY-only/reviewRules V2 descriptions below are historical compatibility branches. Preserve evidence, freshness, journal, publisher, schedules and model.


## เป้าหมาย

ให้ข้อมูลครบตามที่ตรวจได้ ใช้ประกอบการตัดสินใจได้ และส่งรายงานต่อเนื่อง ไม่กำหนดคะแนนขั้นต่ำโดยข้ามข้อจำกัดข้อมูล ไม่รับประกันอัตราชนะ ใช้รายงานเป็น snapshot ตามตารางเดิม ไม่ติดตามแท่งต่อเนื่องระหว่างรอบ

## สัญญา V4 ที่ใช้ก่อนเริ่มวิเคราะห์

เริ่มด้วย FAST_RUN_WORKFLOW.md และ prepare-analysis-run.mjs; อ่านสัญญา V4 เต็มเมื่อเริ่มครั้งแรกหรือ hash กติกาเปลี่ยน รอบถัดไปอ่านเฉพาะส่วนที่ต้องใช้ ลำดับหลักคือ XAU HTF (W1/D1/H4/H1) → Daily SR → AMM → M15 Setup → M5 Trigger → DXY Filter ใช้ SPDR เป็น flow ระยะกลาง ข่าวเป็นชั้นภาวะตลาด/ความเสี่ยง และ EBW เป็นตัวประกอบยืนยันเท่านั้น ตั้ง baseline ครั้งแรกหรือ refresh เมื่อเข้าเงื่อนไข; รอบถัดไปใช้ baseline เดิมพร้อมหลักฐาน origin และตรวจ H1 invalidation ใหม่ตาม policy ไม่ต้องอ่าน HTF ทุกกรอบซ้ำโดยไม่มีเหตุ

## 1. ตรวจอินดิเคเตอร์ประกอบเมื่ออ่านค่า

หลักฐานราคาคือกราฟแท่งมาตรฐาน PEPPERSTONE:XAUUSD; อ่านอินดิเคเตอร์ของผู้ใช้เป็นข้อมูลประกอบบน H1 → M15 → M5 อ่านชื่อและเวอร์ชันที่แสดงจริง ตรวจโหมดและค่าตั้งที่มีผลเมื่อเข้าถึงได้: Intraday/Limit Planner, Signal timeframes, higher-TF filter, Map refresh, cost allowance และ source warmup

เก็บสถานะการตรวจต้นฉบับเป็น UNAVAILABLE / NAME_ONLY / INPUTS_VERIFIED / EXACT_SOURCE_VERIFIED / SOURCE_MISMATCH ใน desk.indicatorVerification และหลักฐานส่วนตัวตาม V4_3_SOURCE_ALIGNMENT.md ชื่อเวอร์ชันตรงกันอย่างเดียวไม่พิสูจน์ว่าโค้ดและ inputs เหมือนต้นฉบับ เมื่ออ่าน Inputs ได้แต่ยังไม่ได้ตรวจ source ใช้ INPUTS_VERIFIED; เมื่ออ่านได้เพียงชื่อใช้ NAME_ONLY ห้ามอ้าง exact match ห้ามเปลี่ยน saved layout หรือ inputs เงียบ ๆ ถ้าสคริปต์ไม่อยู่บนกราฟ ให้ระบุข้อขาดและส่งรายงานข้อมูลที่มี ไม่อ้างว่าติดตั้งแล้ว

ข้อค้นพบจากไฟล์ต้นฉบับที่ผู้ใช้ให้ (เป็นค่าเริ่มต้น/ตรรกะโค้ด ไม่ใช่การยืนยันค่าบนกราฟ):

- ตัวกรอง higher-TF: 5m → 15m, 15m → 1h, 1h → 4h ใช้แท่ง source ที่ปิดก่อนหน้า
- Limit Planner source เริ่มต้น 60 / 240 / 1D และมีเงื่อนไขให้ engine ทำงานตามโหมด ไม่ถือว่ามีข้อมูลครบทุก source เพียงเพราะตั้งค่าเริ่มต้นไว้
- Map refresh มี Closed bars และ Live preview; ค่าที่ preview เปลี่ยนได้ก่อนแท่งปิด
- Signal reference entry คือราคาปิดอ้างอิง ไม่ใช่ราคาที่ผู้ใช้เข้าจริง และการติดตาม SL/TP เริ่มแท่งถัดไป
- Stochastic ที่วาดใน pane บวก 100; ใช้ actual 0–100 ใน Data Window

## 2. เก็บหลักฐานเป็นชุดเดียวต่อกรอบ

อ่านแท่งปิดและเวลาที่เลือกจริง ไม่ใช้ค่าของแท่งกำลังก่อตัว แต่ละกรอบเก็บ screenshot/Data Window ส่วนตัวและ checkpoint ทันที:

| หมวด | สิ่งที่ต้องอ่านเมื่อมีแสดง |
|---|---|
| ราคา | OHLC, เวลาเปิด/ปิด, source symbol และ timeframe |
| โซน | Nearest support/resistance, ขอบโซน Supply/Demand ที่เห็นจริง, source timeframe, สถานะ fresh/tested/invalid ถ้าแสดง |
| น้ำหนักอินดี้ | BUY/SELL edge, preferred side, support/resistance evidence score |
| แผนอินดี้ | Signal reference entry, Signal SL/TP, setup TP, protective anchor, Final BUY/SELL และเวลาแท่งของสัญญาณ |
| โมเมนตัม | RSI และ Stochastic K/D ดิบ |
| เงื่อนไข | warmup, live preview, cost settings และแผนเก่าที่ยังค้าง |

แยก NOT_PRESENT (ไม่มีค่า/สัญญาณในอินดี้), UNREADABLE (อ่านไม่ได้) และ VERIFIED (อ่านพร้อมเวลาได้) ห้ามแทน null ด้วย 0 ห้ามเอา Signal เก่ามาอ้างเป็นสัญญาณของแท่งที่เลือกเพียงเพราะยังแสดงอยู่ แยก Signal TP, setup TP และ nearest resistance ซึ่งอาจมีความหมายต่างกัน

ใช้ indicatorContext.frames fields เดิมกับค่าที่รองรับเป็นตัวประกอบ; โครงสร้างหลักลง desk ตามสัญญา V4.3. โซนและ confluence ลง toolkit.observations / zoneEvidence, source/Inputs ลง indicatorVerification, แยก AMM source, DXY conditions และ SPDR history ตาม fields ที่รองรับ; รายละเอียดส่วนเกินอยู่ใน body และหลักฐานส่วนตัว. ใช้ support/resistance แบบจุดเฉพาะเมื่ออินดี้แสดงเป็นจุด ไม่แปลงขอบโซนเป็นจุดตามใจ

## 3. สังเคราะห์ตามลำดับ Trading Desk V4

1. เริ่มจาก baseline W1/D1/H4/H1 ที่ยังใช้ได้ หรือสร้าง/refresh จากแท่งปิดจริง พร้อม Critical Zone และเงื่อนไขเปลี่ยนฐาน
2. Daily SR บอกตำแหน่ง STRUCTURAL/TACTICAL/CRITICAL; AMM ใช้โซนที่ตรวจได้ช่วยปรับฉากและต้องผ่านทิศทาง HTF ไม่สร้างสัญญาณเดี่ยว
3. M15 เป็นกรอบ setup และยืนยันขั้นต่ำ; M5 ใช้ trigger/retest/fine entry ที่ตามหลัง ไม่ใช้ M5 หรือคะแนนอินดี้สวน M15 สร้างแผนหลัก
4. ระบุ phase ของตลาดแยกจาก phase อินดี้; เลือก PRIMARY หนึ่งแผนและ ALTERNATIVE ได้อีกหนึ่ง พร้อมเงื่อนไขเปลี่ยนฉาก ไม่แสดงสองฝั่งน้ำหนักเท่ากันโดยไม่มีเหตุผลโครงสร้าง
5. แยก Wait zone, No-trade, trigger failure, tactical/structural invalidation, actual Stop และ Re-baseline; ใช้ desk-policy.js เป็นเกณฑ์ข่าว/ความเสี่ยงร่วม
6. แยกสิ่งที่สังเกตจริงกับการตีความ DXY เป็นตัวกรอง SPDR เป็น flow และ EBW เป็นการยืนยันประกอบ ไม่ใช่คะแนนโหวต ไม่ถือว่าอ่าน HTF แล้วเพียงเพราะอินดี้ใช้กรอบนั้น

## 4. ราคา ข่าว และข้อมูลเสริม

- ก่อนสรุป snapshot ตรวจ Bid/Ask/spread ใหม่ ใช้กติกาความสดและต้นทุนใน SCHEDULE_WORKFLOW.md
- เรียก FMP collector ครั้งเดียวต่อรอบ: USD calendar เทียบ Forex Factory, Treasury รายวันพร้อมวันที่, ข่าวทอง/USD/Fed เปิดต้นฉบับก่อนสรุป
- UTC calendar แปลงครั้งเดียว; publishedDate ของบทความไม่ถือเป็น UTC โดยอัตโนมัติ Actual ในอนาคตไม่ใช้ และ null ไม่ใช่ 0
- DXY และ SPDR holdings ตรวจแหล่งตรงเมื่อเข้าถึงได้; GLD quote ไม่แทน holdings และ EURUSD ไม่แทน DXY
- ข้อมูลเสริมไม่ครบไม่ทำให้หยุดรายงานทั้งหมด; ระบุส่วนที่ขาดและผลต่อความมั่นใจอย่างเจาะจง

## 5. สร้างแผนที่ตรวจต่อได้

แสดงสถานะ เหตุผล กรอบยืนยัน โซนเฝ้าดู เงื่อนไขยืนยันตามชนิดแผน (pullback/reaction หรือเบรก/รีเทสต์) เงื่อนไขยกเลิก และข่าวที่ต้องระวังทุกครั้งที่มีหลักฐาน หากโครงสร้าง entry/Stop/TP กับต้นทุนครบ ใช้ WATCH แบบมีเงื่อนไขตามกติกาเดิม; หากไม่ครบใช้ WAIT พร้อมเหตุการณ์ถัดไป ไม่สร้างตัวเลขให้เต็มช่อง

การนำราคาอินดี้มาใช้ต้องตรวจโครงสร้างและเวลาของแผนนั้นก่อน ห้ามยก Signal reference entry เป็นราคาที่เข้าได้ในปัจจุบันโดยอัตโนมัติ Signal TP และ protective anchor เป็นข้อมูลประกอบ ไม่ข้ามการตรวจ spread หรือข่าว

ระบุว่าใช้กติกาอินดี้หรือกติกาวิเคราะห์ที่เพิ่มเอง หากใช้ reviewRules แบบ next-M5-open ห้ามอ้างว่าเป็นผลสัญญาณต้นฉบับที่อ้างราคาปิด เก็บ rules กับรายงานต้นฉบับก่อนเกิดเหตุเพื่อทบทวนโดยไม่เปลี่ยนย้อนหลัง

## 6. จบรอบให้ได้โดยไม่วนอ่านไม่จบ

อ่านข้อมูลหลักก่อนรายละเอียดตกแต่ง บันทึกทุกกรอบที่สำเร็จ; UI ค้างลองแก้แบบตรงจุดหนึ่งครั้งแล้วเก็บข้อขาด FMP จำกัด timeout ต่อ endpoint ไว้แล้ว ไม่ติดตั้ง polling หรือตัวอ่านตลอดวัน

เหลือเวลาสำหรับตรวจ JSON–ข้อความ–ภาพ–journal ให้ตรงกัน ใช้ JSON ชุดเดียวสร้างภาพ ตรวจภาพก่อนส่ง เผยแพร่ภายใน freshness gate 15 นาที; หากเลยให้ตรวจราคาใหม่และสร้าง snapshot/ภาพใหม่จริง ไม่แก้เวลาเก่าให้ดูสด

ทบทวนแผนก่อนด้วยแท่ง Pepperstone ที่ครอบคลุมช่วง: ไม่ครบให้ตรวจไม่ได้; TP/SL แตะแท่งเดียวลำดับไม่ชัดไม่คำนวณ R จากนั้น journal → publish → ตรวจ Pages และ Worker snapshot ตรงกัน → ส่งรายงานใน Codex แม้เผยแพร่ล้มเหลว ห้ามเรียก git push สำเร็จว่าแจ้งเตือนถึงอุปกรณ์แล้ว

## 7. วัดความเสถียรจากการใช้งานจริง

เพิ่มหัวข้อ “ตรวจความครบของรอบ” ใน journal แต่ละรอบ: planId, verified primary frames/3, indicator frames/3, script verification status, quote/news freshness pass/fail, FMP endpoint successes/3, missing fields, retry count, publication result, delivery latency เมื่อมี timestamp ให้พิสูจน์ และ previous-plan review status

เริ่มติดตาม 10 รอบตามตารางจริงก่อนให้คะแนนใหม่ แสดงจำนวนเต็มพร้อมตัวหาร ไม่ให้ pass เพราะฟังก์ชันทดสอบผ่านอย่างเดียว เป้าหมายคือไม่มีข้อมูลเก่าอ้างเป็นสด ไม่มีกรอบ/ราคา/เวลาเดา ไม่มีรายงานหายโดยไม่บันทึกข้อผิดพลาด ข้อมูลหลักครบในสัดส่วนสูงที่วัดได้ หากยังดึงแท่งหรืออินดี้ไม่ได้ซ้ำ ต้องแยกแก้เส้นทางข้อมูลและการตั้งค่ากราฟ ไม่เพิ่มคำอธิบายเพื่อกลบข้อขาด

ข้อจำกัดที่ยังต้องพิสูจน์: โค้ดและ inputs บน TradingView ตรงต้นฉบับจริงหรือไม่, การอ่านข้อมูลครบต่อเนื่องในรอบจริง, โควตาและสถานะเครื่อง, การเข้าถึงแท่งย้อนหลังครบสำหรับทบทวน แบบแผนนี้ยังไม่ใช่หลักฐานว่าปัจจัยเหล่านี้ผ่านแล้ว
