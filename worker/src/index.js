import { sendPushNotification, rawPayload } from "@mmmike/web-push/send";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  if (origin === env.APP_ORIGIN) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function sameSiteRequest(request, env) {
  return Boolean(request.headers.get("Origin") && originAllowed(request, env));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && originAllowed(request, env)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function validateSubscription(subscription) {
  return Boolean(subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    subscription.keys &&
    typeof subscription.keys.p256dh === "string" &&
    typeof subscription.keys.auth === "string");
}

function readBearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function reportView(row) {
  const report = JSON.parse(row.report_json);
  report.id = row.id;
  report.snapshotAt = row.snapshot_at;
  report.status = row.status;
  report.headline = row.headline;
  report.summary = row.summary;
  report.imageUrl = row.image_url || null;
  report.image = Boolean(row.image_url);
  return report;
}

function vapidConfig(env) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) throw new Error("Web Push keys are not configured.");
  return {
    subject: env.VAPID_SUBJECT || "https://github.com/BassSG/XAUChatGPTChat",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
}

async function sendOne(env, subscription, payload) {
  try {
    return await sendPushNotification(
      subscription,
      rawPayload(JSON.stringify(payload)),
      vapidConfig(env),
      { ttl: 3600, urgency: "normal", timeoutMs: 10000 }
    );
  } catch (error) {
    const statusCode = Number(error && error.statusCode);
    if (statusCode === 404 || statusCode === 410) return false;
    throw error;
  }
}

async function route(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method === "GET" && path === "/api/health") {
    return json({ ok: true, service: "xauchatgptchat-api", time: new Date().toISOString() });
  }

  if (method === "GET" && path === "/api/push/public-key") {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: "Push service is not configured yet." }, 503);
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (method === "POST" && path === "/api/push/subscribe") {
    if (!sameSiteRequest(request, env)) return json({ error: "Origin is not allowed." }, 403);
    const body = await request.json().catch(() => null);
    const subscription = body && body.subscription;
    if (!validateSubscription(subscription)) return json({ error: "Invalid push subscription." }, 400);
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent, updated_at=excluded.updated_at"
    ).bind(
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      String(body.userAgent || "").slice(0, 400),
      now,
      now
    ).run();
    return json({ ok: true, subscribed: true });
  }

  if (method === "POST" && path === "/api/push/unsubscribe") {
    if (!sameSiteRequest(request, env)) return json({ error: "Origin is not allowed." }, 403);
    const body = await request.json().catch(() => null);
    const endpoint = body && body.endpoint;
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return json({ error: "Invalid endpoint." }, 400);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
    return json({ ok: true, unsubscribed: true });
  }

  if (method === "POST" && path === "/api/push/test") {
    if (!sameSiteRequest(request, env)) return json({ error: "Origin is not allowed." }, 403);
    const body = await request.json().catch(() => null);
    const subscription = body && body.subscription;
    if (!validateSubscription(subscription)) return json({ error: "Invalid push subscription." }, 400);
    const stored = await env.DB.prepare("SELECT endpoint, p256dh, auth, last_test_at FROM push_subscriptions WHERE endpoint = ?")
      .bind(subscription.endpoint).first();
    if (!stored || stored.p256dh !== subscription.keys.p256dh || stored.auth !== subscription.keys.auth) {
      return json({ error: "This device is not registered." }, 403);
    }
    if (stored.last_test_at && Date.now() - Date.parse(stored.last_test_at) < 60_000) {
      return json({ error: "Please wait a minute before another test alert." }, 429);
    }
    await env.DB.prepare("UPDATE push_subscriptions SET last_test_at = ? WHERE endpoint = ?")
      .bind(new Date().toISOString(), subscription.endpoint).run();
    const delivered = await sendOne(env, subscription, {
      title: "XAU Desk · Test alert",
      body: "Mobile notifications are connected to this device.",
      url: env.APP_URL,
      tag: "xau-desk-test"
    });
    if (!delivered) {
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      return json({ error: "Push endpoint expired. Enable notifications again." }, 410);
    }
    return json({ ok: true, sent: true });
  }

  if (method === "GET" && path === "/api/reports/latest") {
    const row = await env.DB.prepare(
      "SELECT id, snapshot_at, status, headline, summary, report_json, image_url, created_at FROM reports ORDER BY snapshot_at DESC LIMIT 1"
    ).first();
    return json({ report: row ? reportView(row) : null });
  }

  if (method === "GET" && path === "/api/reports/history") {
    const limit = Math.max(1, Math.min(30, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
    const result = await env.DB.prepare(
      "SELECT id, snapshot_at, status, headline, summary, report_json, image_url, created_at FROM reports ORDER BY snapshot_at DESC LIMIT ?"
    ).bind(limit).all();
    return json({ reports: (result.results || []).map(reportView) });
  }

  if (method === "POST" && path === "/api/admin/reports") {
    if (!env.REPORT_TOKEN || readBearer(request) !== env.REPORT_TOKEN) {
      return json({ error: "Unauthorized." }, 401);
    }
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > 100_000) return json({ error: "Report payload is too large." }, 413);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.snapshotAt !== "string" || !Number.isFinite(Date.parse(body.snapshotAt))) {
      return json({ error: "A valid snapshotAt timestamp is required." }, 400);
    }
    const snapshotAt = new Date(body.snapshotAt).toISOString();
    const headline = String(body.headline || "XAU/USD desk brief").slice(0, 180);
    const summary = String(body.summary || body.body || "").slice(0, 500);
    const status = String(body.status || body.bias || "WAIT").toUpperCase().slice(0, 30);
    let imageUrl = null;
    if (typeof body.imageUrl === "string" && body.imageUrl) {
      try {
        const candidate = new URL(body.imageUrl);
        if (candidate.origin === env.APP_ORIGIN && candidate.pathname.startsWith("/XAUChatGPTChat/reports/")) {
          imageUrl = candidate.toString();
        }
      } catch {
        imageUrl = null;
      }
    }
    delete body.imageBase64;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO reports (id, snapshot_at, status, headline, summary, report_json, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, snapshotAt, status, headline, summary, JSON.stringify(body), imageUrl, createdAt).run();

    const subscriptionsResult = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all();
    const subscriptions = subscriptionsResult.results || [];
    const notification = {
      title: "XAU Desk · " + status,
      body: summary || "A new XAU/USD desk brief is ready to review.",
      url: env.APP_URL,
      tag: "xau-desk-brief",
      image: imageUrl || undefined
    };
    let delivered = 0;
    let failed = 0;
    let removed = 0;
    for (let offset = 0; offset < subscriptions.length; offset += 5) {
      const group = subscriptions.slice(offset, offset + 5);
      const results = await Promise.all(group.map(async (stored) => {
        const sub = {
          endpoint: stored.endpoint,
          keys: { p256dh: stored.p256dh, auth: stored.auth }
        };
        try {
          const ok = await sendOne(env, sub, notification);
          return { endpoint: stored.endpoint, ok, gone: !ok };
        } catch {
          return { endpoint: stored.endpoint, ok: false, gone: false };
        }
      }));
      for (const result of results) {
        if (result.ok) delivered += 1;
        else if (result.gone) {
          removed += 1;
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(result.endpoint).run();
        } else failed += 1;
      }
    }
    return json({ ok: true, reportId: id, notifications: { registered: subscriptions.length, delivered, failed, removed } }, 201);
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "OPTIONS" && !originAllowed(request, env) && !url.pathname.startsWith("/api/admin/")) {
      return withCors(json({ error: "Origin is not allowed." }, 403), request, env);
    }
    try {
      return withCors(await route(request, env, url), request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      return withCors(json({ error: message }, 500), request, env);
    }
  }
};
