self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "XAU Desk · New brief";
  const options = {
    body: payload.body || "A new XAU/USD desk brief is ready.",
    icon: new URL("icons/xau-desk-192.png", self.registration.scope).toString(),
    badge: new URL("icons/gold-mark.svg", self.registration.scope).toString(),
    image: payload.image || undefined,
    tag: payload.tag || "xau-desk-brief",
    renotify: false,
    data: { url: payload.url || self.registration.scope }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : self.registration.scope;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (client.url === target || client.url.startsWith(self.registration.scope)) {
        await client.focus();
        if (client.navigate && client.url !== target) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
