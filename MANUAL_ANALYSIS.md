# Manual analysis in XAU Desk

The app accepts one authenticated manual request every 15 minutes. A running or queued request blocks another request even after 15 minutes. This does not edit the existing schedules.

The Windows connector makes outbound HTTPS requests only. It checks for an open ChatGPT/Codex desktop window and probes the local Codex App Server model catalog before advertising availability. Closing/minimizing are different: a minimized open app is available; a closed app is not. A heartbeat expires after 30 seconds, and the connector checks again before starting a task. Network failure disables the action. The public website cannot inspect a remote computer by itself.

The connector uses the documented local `codex app-server --stdio` interface, with GPT-6 Sol and high reasoning. It creates a separate saved task and sends the fixed report workflow. It does not connect to the desktop browser session through an undocumented API. Tool availability may differ from desktop scheduled tasks; when a source cannot be verified, the report must follow the existing truthful WAIT workflow. Do not promise identical browser capabilities without verifying them in the new task.

## Setup on the owner's PC

1. Apply the D1 migration and deploy the Worker.
2. Provision `MANUAL_ANALYSIS_BOOTSTRAP_TOKEN` as a Worker secret and store its matching value privately in `%LOCALAPPDATA%/XAU Desk/bootstrap.key`. Never commit or display it. `scripts/provision-manual-analysis.mjs` performs this without printing the value.
3. Start `scripts/start-xau-desk-agent.cmd`, or use the installed current-user startup shortcut. The connector remains idle until a paired device requests a report; checks do not make model inference calls.
4. Open `%LOCALAPPDATA%/XAU Desk/pairing.html` on the PC. On the phone or tablet, open XAU Desk → Settings and enter the one-use code. It expires in 15 minutes. Restart the connector to renew an unused expired code.
5. Keep the PC awake and Codex open. Press **วิเคราะห์ตอนนี้** on the home page. The app shows queued, running, offline, failed, and cooldown states. A successful task is marked complete only after the Worker contains the matching `manualRequestId` in a published report.

This version pairs one browser/PWA installation. Pair in the installed PWA that will be used to request analyses. Other devices can still read all public reports. Unpair in app settings before moving control to a different device. Unpairing keeps the 15-minute cooldown. Resetting browser storage removes that device's control token; recovery must be performed locally by the owner, never through an unauthenticated public reset endpoint.

## Local operation and recovery

Only the fixed analysis workflow can be queued; the API accepts no arbitrary prompt, model, shell command, or path. Device credentials and browser credentials are different and stored as hashes in D1. All live availability responses are authenticated and uncached. The one-statement D1 gate and enqueue trigger prevent simultaneous requests from winning twice.

The analysis session uses workspace-write permissions and network access, with no automatic permission escalation. Interactive permission requests cannot be approved by the connector. The task may fail if a required integration or permission is unavailable. No report is called complete based only on the model saying it finished.

For an interrupted connector, inspect the saved Codex task and actual report before clearing `activeJob` in the private local connector state and resolving the matching D1 request. An uncertain in-progress task is deliberately not retried automatically. No test or synthetic market data should be published while testing the connector.

To disable automatic startup, remove the **XAU Desk Connector** shortcut from the current user's Windows Startup folder and stop the connector process. The app then disables the request button after heartbeat expiry. This does not affect scheduled analyses or reading reports.

## Verification

`node --test scripts/manual-analysis.test.mjs` uses a local Miniflare D1 database to test pairing, invalid authorization, offline and closed-app gates, eight simultaneous clicks, single job claim, busy state, and cooldown. It does not contact production or publish reports.

Official protocol: https://learn.chatgpt.com/docs/app-server
