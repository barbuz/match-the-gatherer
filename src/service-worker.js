import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { APP_VERSION } from './lib/version.js';

export const SW_VERSION = APP_VERSION;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Serve page navigations network-first. A stale precached index.html from an
// older service worker is never served once a newer build exists: the HTML
// shell always points at the latest bundle, so the app can't get stuck on an
// old one. Hashed app assets remain precached as before.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'mtg:navigation' }),
);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(SW_VERSION);
  }
});
