import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  PrecacheFallbackPlugin,
} from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { APP_VERSION } from './lib/version.js';

export const SW_VERSION = APP_VERSION;

cleanupOutdatedCaches();

// Serve page navigations network-first. This MUST be registered before
// `precacheAndRoute` below: Workbox matches routes in registration order, and
// the precache route answers a navigation to `/` with the precached
// `index.html`. If precache went first it would win, pinning the app to the
// cached HTML shell (and thus the old bundle) forever. Offline still works via
// the precached shell through `PrecacheFallbackPlugin`.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'mtg:navigation',
    plugins: [new PrecacheFallbackPlugin({ fallbackURL: 'index.html' })],
  }),
);

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(SW_VERSION);
  }
});
