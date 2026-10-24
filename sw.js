// Service worker for the student app (member.html): shows push notifications
// sent from admin.html (Edge Function "send-push"). No offline caching on
// purpose, so a push to GitHub Pages is always picked up right away.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
    event.waitUntil(self.registration.showNotification(data.title || 'Bhangra Sway', {
        body: data.body || '',
        icon: 'icons/icon-192.png',   // the round gold BS logo
        badge: 'icons/badge-96.png',  // small white BS in the Android status bar
        vibrate: [120, 60, 120, 60, 320], // "dhak-dhak-dhaaak" (Android; iPhone uses its own)
        tag: data.tag,
        data: { url: data.url || 'member.html' }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL((event.notification.data && event.notification.data.url) || 'member.html', self.registration.scope).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        // A link outside the app (e.g. the Google review page): open it as is.
        if (!url.startsWith(self.registration.scope)) return self.clients.openWindow(url);
        const open = list.find((c) => c.url.startsWith(self.registration.scope));
        if (open) {
            // «Tap to check in»: reload the open app so the check-in runs again.
            // Anything else just brings the app to the front (no lost forms).
            if (/checkin=1/.test(url) && open.navigate) return open.navigate(url).catch(() => open).then((c) => (c || open).focus());
            return open.focus();
        }
        return self.clients.openWindow(url);
    }));
});
