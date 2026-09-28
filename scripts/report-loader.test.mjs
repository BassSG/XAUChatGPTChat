import test from "node:test";
import assert from "node:assert/strict";
import { loadReportSources } from "../src/report-loader.js";

test("Pages renders before a stalled Worker finishes or times out", async () => {
  const rendered = [];
  const report = { snapshotAt: "2026-09-28T09:00:00+07:00", status: "WAIT" };
  const task = loadReportSources([{ name: "pages", url: "pages" }, { name: "worker", url: "worker" }],
    (name, value) => rendered.push({ name, value }), {
      timeoutMs: 40,
      fetchImpl: async (url) => url === "pages" ? { ok: true, json: async () => report } : new Promise(() => {})
    });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rendered, [{ name: "pages", value: report }]);
  const result = await task;
  assert.equal(result[1].status, "rejected");
});

test("malformed Pages data does not prevent the Worker report", async () => {
  const rendered = [];
  await loadReportSources([{ name: "pages", url: "pages" }, { name: "worker", url: "worker" }],
    (name) => rendered.push(name), { fetchImpl: async (url) => ({ ok: true, json: async () => {
      if (url === "pages") throw new Error("Invalid JSON");
      return { report: { snapshotAt: "2026-09-28T09:00:00+07:00" } };
    } }) });
  assert.deepEqual(rendered, ["worker"]);
});
