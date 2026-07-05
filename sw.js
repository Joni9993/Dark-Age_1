// Service Worker — Dark Ages
// Receives Web Push notifications and shows them.

// Ohne skipWaiting/clients.claim bleibt ein alter SW (ohne Push-Fix) in bereits
// offenen PWA-Fenstern aktiv, bis die App komplett geschlossen und neu geöffnet wird —
// bei installierten mobilen PWAs passiert das selten von selbst.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = { title: 'Dark Ages', body: 'Du bist dran!', url: '/' };
  try { data = event.data ? event.data.json() : data; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  '/Icon.png',
      badge: '/Icon.png',
      data:  { url: data.url },
      vibrate: [200, 100, 200],
    })
  );
});

// Der Browser kann eine bestehende Push-Subscription jederzeit ungültig machen/rotieren
// (z.B. Chrome/Android periodisch) — ohne diesen Handler würde der Server danach ins Leere senden.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then(newSub => self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        list.forEach(c => c.postMessage({ type: 'push-resubscribed', subscription: newSub.toJSON() }));
      }))
      .catch(() => {})
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(target) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
