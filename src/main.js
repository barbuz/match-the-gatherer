import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {});
}

const app = mount(App, { target: document.getElementById('app') });
export default app;
