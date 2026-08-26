import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { APP_VERSION } from './lib/version.js';

export const SW_VERSION = APP_VERSION;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(SW_VERSION);
  }
});
