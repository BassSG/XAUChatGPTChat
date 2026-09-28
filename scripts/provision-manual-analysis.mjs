// Run only on the owner's PC with an authenticated Wrangler installation.
// Secret values stay in a private local file and stdin; never print them.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(process.env.LOCALAPPDATA, 'XAU Desk');
await mkdir(directory, { recursive: true });
const file = join(directory, 'bootstrap.key');
let secret;
try { secret = (await readFile(file, 'utf8')).trim(); }
catch (e) { if (e.code !== 'ENOENT') throw e; secret = randomBytes(32).toString('base64url'); await writeFile(file, secret, { mode: 0o600, flag: 'wx' }); }
const uploaded = spawnSync(process.execPath, [join(root, 'worker/node_modules/wrangler/bin/wrangler.js'), 'secret', 'put', 'MANUAL_ANALYSIS_BOOTSTRAP_TOKEN'], { cwd: join(root, 'worker'), input: secret, encoding: 'utf8', windowsHide: true, timeout: 120000 });
if (uploaded.status !== 0) { console.error('Secret provisioning failed. No secret value has been logged.'); process.exit(1); }
const configFile = join(directory, 'connector.json');
let config; try { config = JSON.parse(await readFile(configFile, 'utf8')); } catch { config = {}; }
if (process.env.XAU_CODEX_PATH) config.codexPath = process.env.XAU_CODEX_PATH;
await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
console.log('Worker secret configured; private connector files saved locally.');
