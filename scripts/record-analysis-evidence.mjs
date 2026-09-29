import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvidencePack, matchReportEvidence } from '../src/analysis-evidence.js';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const input = option('--input');
if (!input) throw new Error('Usage: node scripts/record-analysis-evidence.mjs --input observations.json [--report report.json] [--output-root private-directory]');
const pack = validateEvidencePack(JSON.parse((await readFile(input, 'utf8')).replace(/^\uFEFF/, '')));
const canonical = JSON.stringify(pack);
const sha256 = createHash('sha256').update(canonical).digest('hex');
const root = resolve(option('--output-root') || join(dirname(fileURLToPath(import.meta.url)), '../../../outputs/analysis-evidence'));
// This private archive is outside public/ and is never staged by the publisher.
await mkdir(root, { recursive: true });
const path = join(root, sha256 + '.json');
try { await writeFile(path, canonical + '\n', { encoding: 'utf8', flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST') throw error; if ((await readFile(path, 'utf8')).trim() !== canonical) throw new Error('Immutable evidence archive mismatch'); }
const archive = { sha256, capturedAt: pack.capturedAt, method: pack.method, counts: Object.fromEntries(Object.entries(pack.frames).map(([frame, bars]) => [frame, bars.length])) };
const reportPath = option('--report');
if (reportPath) {
  const report = JSON.parse((await readFile(reportPath, 'utf8')).replace(/^\uFEFF/, ''));
  matchReportEvidence(report, pack);
  report.evidenceArchive = archive;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify({ saved: true, path, evidenceArchive: archive }));
