// ShiftBook Service Worker — handles notification display
// Must be served from the root of the domain: /sw.js

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Listen for notification requests from the main page
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = e.data;
    e.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        requireInteraction: false,
      })
    );
  }
});

// Handle notification click — focus or open the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If app is already open, focus it
      for (const client of clients) {
        if (client.url.includes('holiday-tracker') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open it
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
