// Service Worker — Dark Ages
// Receives Web Push notifications and shows them.

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
