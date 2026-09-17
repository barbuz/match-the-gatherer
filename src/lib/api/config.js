/**
 * Backend base URL (backend spec §3/§4). The daily answer and the anonymous
 * stats sink live on the same Worker. Override with `VITE_API_BASE` when
 * running against a local `wrangler dev` (e.g. http://localhost:8787).
 */
const configured = import.meta.env?.VITE_API_BASE;

export const API_BASE = (configured || 'https://match-the-gatherer.barbuz.workers.dev').replace(
  /\/+$/,
  ''
);