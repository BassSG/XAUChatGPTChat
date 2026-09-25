import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateVapidKeys } from "@mmmike/web-push/vapid";

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(workerDir, "wrangler.jsonc");
const config = JSON.parse(await readFile(configPath, "utf8"));
const { publicKey, privateKey } = await generateVapidKeys();
const reportToken = randomBytes(32).toString("base64url");

config.vars.VAPID_PUBLIC_KEY = publicKey;
await writeFile(configPath, JSON.stringify(config, null, 2) + String.fromCharCode(10), "utf8");

const wranglerCli = path.join(workerDir, "node_modules", "wrangler", "bin", "wrangler.js");
function runNode(args, input) {
  execFileSync(process.execPath, args, {
    cwd: workerDir,
    input: input + String.fromCharCode(10),
    stdio: ["pipe", "ignore", "inherit"]
  });
}
function runGh(args, input) {
  execFileSync("gh", args, {
    cwd: workerDir,
    input: input + String.fromCharCode(10),
    stdio: ["pipe", "ignore", "inherit"]
  });
}

runNode([wranglerCli, "secret", "put", "VAPID_PRIVATE_KEY", "--config", configPath], privateKey);
runNode([wranglerCli, "secret", "put", "REPORT_TOKEN", "--config", configPath], reportToken);
runGh(["secret", "set", "XAU_REPORT_TOKEN", "--repo", "BassSG/XAUChatGPTChat"], reportToken);
process.stdout.write("VAPID keys and the protected report-publishing token are configured.");
