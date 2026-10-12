// Service worker for push notifications. This file is YOURS to edit — it ships as a starting
// point, not as SDK code.
//
// ⚠⚠ THERE IS NO `fetch` HANDLER HERE, AND THERE MUST NEVER BE ONE.
//
// A caching service worker looks like a free win and is the single most expensive mistake you can
// make on this platform. A cached `index.html` points at content-hashed chunks that the NEXT
// deploy deletes; the player then gets a white screen served from INSIDE their own browser, where
// neither a CDN purge nor Ctrl+F5 reaches it. The platform has already paid for that bug once, in
// the publisher dashboard, and the fix was to stop caching HTML at all. A `fetch` handler here
// would bring it back in a form that is much harder to undo. If you want offline support, do it
// deliberately and never cache the document.
//
// ⚠ Registered RELATIVE to the page (`./sw.js`). A hosted build runs on the title's own origin,
// `{titleid}.idos.games`, so the live game's worker covers that whole origin — and nothing else:
// no other game lives there. A pinned version (`/v/{buildId}/`, the DEV preview) gets a worker
// scoped to its own folder. On the legacy shared `cloud.idosgames.com` the relative path is what
// kept each game in `/drive/app/{titleID}/`; do not add `Service-Worker-Allowed` to widen it.

self.addEventListener("install", (event) => {
  // Take over immediately. Without this the new worker waits for every tab of this game to close,
  // and a player with the game open all day would keep the old one for days.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * A notification arrived.
 *
 * ⚠ `showNotification` is NOT optional. The subscription was created with `userVisibleOnly: true`,
 * which is a promise to display every message; break it and the browser first shows its own
 * "this site is sending background notifications" warning, then revokes the permission.
 *
 * The payload is the small JSON the server encrypts per device: `{ title, body?, url?, icon? }`.
 * The text is already resolved into the device's language — do not translate it here.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Never let a malformed payload swallow the notification: the promise above still stands.
  }

  const title = payload.title || "";
  if (!title) return; // An empty notification is a blank grey box. Better to show nothing.

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || undefined,
      icon: payload.icon || undefined,
      // Keeps a repeated notification from stacking into a pile the player has to dismiss one by
      // one. Give the server-side producer a stable key per kind of message.
      tag: payload.tag || undefined,
      data: { url: payload.url || "./" },
    }),
  );
});

/**
 * Where a click is allowed to take the player.
 *
 * The URL arrives IN THE PAYLOAD, and for game events the server takes it from the TITLE CONFIG.
 * Anything outside this worker's own scope is refused: a notification shown under your game's
 * name and icon must not be able to send the tab to an arbitrary site, which is exactly what a
 * phishing notification is for ("your session expired, sign in again").
 *
 * A refused URL does not cancel the click — the player pressed it, and opening the game is more
 * honest than doing nothing, which reads as a broken notification.
 */
function safeTarget(raw) {
  const scope = self.registration.scope;

  try {
    const url = new URL(raw || scope, scope);
    return url.href.startsWith(scope) ? url.href : scope;
  } catch {
    return scope;
  }
}

/**
 * The player tapped the notification.
 *
 * Focuses an already-open tab of this game instead of opening a second one — two copies of the
 * same game in two tabs is its own kind of bug.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = safeTarget(
    event.notification.data && event.notification.data.url,
  );

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        return self.clients.openWindow
          ? self.clients.openWindow(target)
          : undefined;
      }),
  );
});
