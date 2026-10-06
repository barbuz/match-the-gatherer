import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        // Browsers throttle service-worker update checks (Firefox can wait up
        // to 24h), so a fresh deploy could otherwise sit unseen behind the
        // cached shell. Poll explicitly when the tab regains focus and hourly
        // while open; `autoUpdate` reloads once the new worker activates.
        if (!registration) return;
        const check = () => registration.update().catch(() => {});
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        setInterval(check, 60 * 60 * 1000);
      },
    }))
    .catch(() => {});
}

const app = mount(App, { target: document.getElementById('app') });
export default app;
