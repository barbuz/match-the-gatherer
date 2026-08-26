const METADATA_URL = 'https://api.scryfall.com/bulk-data/oracle_tags';

/** Fetch bulk-data metadata (download URL + last-updated timestamp, spec §4.3). */
export async function fetchOracleTagMetadata() {
  const res = await fetch(METADATA_URL);
  if (!res.ok) throw new Error(`oracle-tag metadata fetch failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Download the gzipped JSONL oracle-tag bulk file and invert it into a
 * Map of oracle_id -> [tag labels].
 *
 * The file is decompressed in-stream via the native DecompressionStream API
 * (falling back to pako where unavailable) — no manual temp-file step.
 */
export async function fetchOracleTagIndex(metadata) {
  const url = metadata.jsonl_download_uri ?? metadata.download_uri;
  if (!url) throw new Error('oracle-tag metadata has no download URI');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`oracle-tag download failed: HTTP ${res.status}`);

  const index = new Map();
  await readJsonLines(res, (obj) => {
    if (!obj || obj.type !== 'oracle' || !Array.isArray(obj.taggings)) return;
    for (const tagging of obj.taggings) {
      const id = tagging?.oracle_id;
      if (!id) continue;
      const existing = index.get(id);
      if (existing) existing.push(obj.label);
      else index.set(id, [obj.label]);
    }
  });
  return index;
}

async function readJsonLines(res, onObject) {
  if (typeof DecompressionStream !== 'undefined' && res.body) {
    const reader = res.body.pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onObject(JSON.parse(line));
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) onObject(JSON.parse(tail));
  } else {
    const { ungzip } = await import('pako');
    const text = ungzip(new Uint8Array(await res.arrayBuffer()), { to: 'string' });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) onObject(JSON.parse(trimmed));
    }
  }
}
