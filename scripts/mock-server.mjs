/**
 * Local mock of the daily backend, for manual QA (AGENTS.md "Manual QA against
 * a local mock"). Serves the built `dist/` **and** the API from one origin, so
 * the app and the API share an origin and the service worker can't serve a
 * different build than the API you think you're testing.
 *
 * Mirrors the real Worker's quirks deliberately:
 * - `/api/daily/<date>` is a **pre-gzipped** body with **no `Content-Encoding`**
 *   (backend spec §3.4), so the client's own inflate path is exercised.
 * - a non-today date 302s to today, so the client's final-URL day-key logic runs.
 * - `/api/stats*` returns aggregates with no `target` (§4.5).
 *
 * The reveal is derived exactly as the backend does it (FNV-1a over the date
 * key, over the card's type-line tokens), so the clue you see is the clue the
 * real server would serve for that card and day.
 *
 * Usage (run from the repo root so `dist/` and `.mock-cards/` resolve):
 *   npm run mock            # or: node scripts/mock-server.mjs [--port 12000] [--dist dist]
 * Then open http://127.0.0.1:<port>/mock to pick a card, or /#/daily to play.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { compareCards } from '../src/lib/game/comparison.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(argOf('--port', process.env.PORT ?? 12000));
const DIST = path.resolve(argOf('--dist', 'dist'));
const CARD_CACHE = path.resolve('.mock-cards');
/** The real game's guess limit (`MAX_GUESSES` in `gameState.js`). Seeding only
 *  these buckets keeps the mock crowd looking like a real day's. */
const GAME_MAX_GUESSES = 6;
/** Buckets the real backend aggregates (backend `stats.ts`). It outlives the
 *  game's limit so wins from a day played under an older limit stay visible. */
const STATS_BUCKETS = 10;

/** Cards offered on the control page, chosen to exercise different clues. */
const SCENARIOS = [
  { id: 'kithkin', label: 'Kithkin Healer', why: 'one subtype of several', name: 'Kithkin Healer' },
  { id: 'solring', label: 'Sol Ring', why: 'single type, no subtypes', name: 'Sol Ring' },
  { id: 'counterspell', label: 'Counterspell', why: 'vowel-initial type ("an …")', name: 'Counterspell' },
  { id: 'llanowar', label: 'Llanowar Elves', why: 'vowel-initial subtype ("an Elf")', name: 'Llanowar Elves' },
  { id: 'akroma', label: 'Akroma, Angel of Wrath', why: 'supertypes are candidates too', name: 'Akroma, Angel of Wrath' },
  { id: 'doctor', label: 'The Tenth Doctor', why: 'multi-word subtype splits ("Time", "Lord", "Doctor")', name: 'The Tenth Doctor' },
];

/**
 * A finished match, seeded into IndexedDB so the ended-game board (and the
 * token-level mistake marks) can be inspected without typing six guesses.
 * Every non-answer lacks the revealed `Artifact`, so it is a mistake; the
 * answer itself is the last guess.
 */
const PLAYED = {
  target: 'solring',
  guesses: ['llanowar', 'kithkin', 'counterspell', 'akroma', 'doctor', 'solring'],
};

// ---------------------------------------------------------------- utilities

const utcDateKey = (d = new Date()) => d.toISOString().slice(0, 10);

let activeId = process.env.MOCK_CARD ?? 'kithkin';
/** The date the mock pretends is today; any other requested date 302s to it. */
let activeDate = argOf('--date', process.env.MOCK_DATE ?? utcDateKey());

function seedFromDateKey(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SUPER_TYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Ongoing']);

function typeLineTokens(typeLine) {
  const text = String(typeLine ?? '');
  const dash = text.indexOf('—');
  const left = (dash === -1 ? text : text.slice(0, dash)).trim();
  const right = dash === -1 ? '' : text.slice(dash + 1).trim();
  const out = [];
  for (const t of left.split(/\s+/).filter(Boolean)) {
    out.push({ property: SUPER_TYPES.has(t) ? 'supertype' : 'type', value: t });
  }
  for (const t of right.split(/\s+/).filter(Boolean)) {
    out.push({ property: 'subtype', value: t });
  }
  return out;
}

/** Same derivation as backend `selectReveal` (§3.7). */
function selectReveal(dateKey, card) {
  const faces = Array.isArray(card?.card_faces) && card.card_faces.length ? card.card_faces : [card];
  const out = [];
  const seen = new Set();
  for (const face of faces) {
    for (const token of typeLineTokens(face?.type_line ?? '')) {
      const key = token.value.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }
  return out.length ? out[seedFromDateKey(dateKey) % out.length] : null;
}

/**
 * The next date (starting from the mock's today) whose reveal is `value` for
 * this card, so the control page can offer "show me the an Elf clue" without
 * making the user hunt through dates by hand.
 */
function nextDateRevealing(card, value, from = activeDate) {
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < 400; i++) {
    const key = utcDateKey(new Date(start + i * 86_400_000));
    if (selectReveal(key, card)?.value === value) return key;
  }
  return null;
}

// ------------------------------------------------------------------- cards

async function loadCard(name) {
  fs.mkdirSync(CARD_CACHE, { recursive: true });
  const file = path.join(CARD_CACHE, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  // The same query the app uses to resolve a guess (lib/api/scryfall.js), so
  // the served printing is the one the board compares against. A bare
  // `cards/named?exact=` returns Scryfall's *newest* printing instead, which
  // shows a phantom "target is newer" date clue on every guess.
  const q = encodeURIComponent(`!"${name}" not:reprint`);
  const url = `https://api.scryfall.com/cards/search?q=${q}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'mtg-mock/1.0' } });
  if (!res.ok) throw new Error(`Scryfall ${res.status} for ${name}`);
  const body = await res.json();
  const card = body?.data?.[0];
  if (!card) throw new Error(`Scryfall returned no card for ${name}`);
  fs.writeFileSync(file, JSON.stringify(card, null, 2));
  return card;
}

const cards = new Map();
async function prefetchCards() {
  for (const s of SCENARIOS) {
    try {
      cards.set(s.id, await loadCard(s.name));
    } catch (err) {
      console.warn(`! could not preload ${s.name}: ${err.message}`);
    }
  }
}

// ------------------------------------------------------------------- stats

/** In-memory aggregates, so a played game shows up in the summary. */
const statsByDay = new Map();
const seenDevices = new Set();

function emptyStats(date) {
  const byGuesses = {};
  for (let n = 1; n <= STATS_BUCKETS; n++) byGuesses[String(n)] = { plain: 0, hint: 0 };
  return { date, won: 0, lost: 0, abandoned: 0, byGuesses };
}

function statsFor(date) {
  if (!statsByDay.has(date)) {
    // Seed with a plausible crowd so the summary isn't an empty skeleton.
    const s = emptyStats(date);
    s.won = 412;
    s.lost = 96;
    s.abandoned = 23;
    // Indexed by guess count; only the real game's limit gets seeded wins, so
    // the buckets above it stay empty (as they would on a real day).
    const spread = [0, 12, 48, 96, 118, 89, 49];
    for (let n = 1; n <= GAME_MAX_GUESSES; n++) {
      const total = spread[n] ?? 0;
      const hint = Math.round(total * 0.3);
      s.byGuesses[String(n)] = { plain: total - hint, hint };
    }
    statsByDay.set(date, s);
  }
  return statsByDay.get(date);
}

/**
 * The IndexedDB record for the pre-played match: the game key, the game (with
 * `compareCards` results, exactly as `addGuess` persists them) and the local
 * stats. Returns `null` while a card is still missing.
 */
function playedFixture() {
  const target = cards.get(PLAYED.target);
  const sequence = PLAYED.guesses.map((id) => cards.get(id));
  if (!target || sequence.some((card) => !card)) return null;
  const guesses = sequence.map((card) => ({ card, results: compareCards(card, target) }));
  return {
    dbName: 'keyval-store',
    storeName: 'keyval',
    gameKey: `mtg:game:${activeDate}`,
    game: {
      targetName: target.name,
      guesses,
      hintsUsed: [],
      hintCounts: {},
      status: 'won',
      communityStats: statsFor(activeDate),
    },
    stats: { played: 1, won: 1, days: [activeDate], results: { [activeDate]: true } },
  };
}

// -------------------------------------------------------------------- http

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, headers);
  res.end(body);
};

const sendJson = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json' });

function gzip(buf) {
  return zlib.gzipSync(buf);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function controlPage() {
  const playedReady = Boolean(playedFixture());
  const rows = SCENARIOS.map((s) => {
    const card = cards.get(s.id);
    const reveal = card ? selectReveal(activeDate, card) : null;
    const active = s.id === activeId;
    const clue = reveal ? `${reveal.property}: ${reveal.value}` : '—';
    // Offer a jump to each other token this card could reveal, so the article
    // cases ("an Elf", "a Kithkin") are one click away instead of a date hunt.
    const tokens = card ? typeLineTokens(card.type_line) : [];
    const jumps = tokens
      .filter((t) => t.value !== reveal?.value)
      .map((t) => {
        const date = nextDateRevealing(card, t.value);
        return date
          ? `<a href="/mock/select/${s.id}/${date}">${t.value}</a>`
          : t.value;
      })
      .join(' · ');
    return `<tr class="${active ? 'on' : ''}">
      <td><a href="/mock/select/${s.id}">${s.label}</a></td>
      <td class="why">${s.why}</td>
      <td><code>${card?.type_line ?? '?'}</code></td>
      <td>${clue}${active ? ' <strong>· active</strong>' : ''}
          ${jumps ? `<div class="jumps">also: ${jumps}</div>` : ''}</td>
    </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mock backend</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 62rem; padding: 0 1rem; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr.on { background: #eef6ff; }
  .why { color: #666; font-size: .9em; }
  .jumps { color: #666; font-size: .85em; margin-top: .25rem; }
  code { background: #f4f4f4; padding: .1rem .3rem; border-radius: 3px; }
  .play { display: inline-block; margin-top: 1rem; padding: .6rem 1rem; background: #1b6ef3;
          color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
  .note { background: #fffbe6; border-left: 3px solid #e6c200; padding: .6rem .8rem; margin: 1rem 0; }
</style></head><body>
<h1>Mock backend</h1>
<p>Origin <code>http://127.0.0.1:${PORT}</code> · mock day <code>${activeDate}</code></p>
<div class="note">Picking a card clears this origin's caches (IndexedDB, localStorage,
service worker) and then loads the daily game, so you always get the newly chosen
card rather than a cached answer for today.</div>
<table>
  <tr><th>Card</th><th>Demonstrates</th><th>Type line</th><th>Today's clue</th></tr>
  ${rows}
</table>
<a class="play" href="/#/daily">Play the daily game →</a>
${playedReady ? `<a class="play" href="/mock/played">View an already-played match →</a>
<p class="why">Seeds a won six-guess match for <code>${cards.get(PLAYED.target)?.name}</code>
(five guesses contradict the revealed clue) into this origin's storage, so the
ended-game board and its mistake marks can be inspected without playing.</p>` : ''}
<h2>Request log</h2>
<p>Every API call is printed to the server's stdout, so you can confirm which
requests the app actually makes.</p>
</body></html>`;
}

/** Shown after picking a card: clears client caches, then loads the game. */
function clearingPage(id) {
  const label = SCENARIOS.find((s) => s.id === id)?.label ?? id;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Switching to ${label}…</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui,sans-serif;margin:4rem auto;max-width:32rem;text-align:center;}</style>
</head><body>
<p>Switching to <strong>${label}</strong>…</p>
<p id="s">Clearing caches…</p>
<script>
(async () => {
  const set = (t) => { document.getElementById('s').textContent = t; };
  try {
    localStorage.clear();
    sessionStorage.clear();
    for (const d of await indexedDB.databases()) {
      if (d.name) await new Promise((r) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = r;
      });
    }
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    if (navigator.serviceWorker) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    }
    set('Loading the game…');
    location.replace('/?fresh=' + Date.now() + '#/daily');
  } catch (err) {
    set('Could not clear caches: ' + err.message + ' — clear them manually, then open /#/daily');
  }
})();
</script>
</body></html>`;
}

/** Seeds a finished match into IndexedDB, then loads it. The game (and its
 *  computed results) lives client-side, so a plain 302 cannot do this. */
function playedPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Seeding an already-played match…</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui,sans-serif;margin:4rem auto;max-width:32rem;text-align:center;}</style>
</head><body>
<p>Seeding an already-played match…</p>
<p id="s">Clearing caches…</p>
<script>
const set = (t) => { document.getElementById('s').textContent = t; };
(async () => {
  try {
    localStorage.clear();
    sessionStorage.clear();
    for (const d of await indexedDB.databases()) {
      if (d.name) await new Promise((r) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = r;
      });
    }
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    if (navigator.serviceWorker) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    }
    set('Writing the played match…');
    const fx = await fetch('/mock/fixture/played').then((r) => {
      if (!r.ok) throw new Error('fixture ' + r.status);
      return r.json();
    });
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(fx.dbName);
      open.onupgradeneeded = () => open.result.createObjectStore(fx.storeName);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(fx.storeName, 'readwrite');
      tx.objectStore(fx.storeName).put(fx.game, fx.gameKey);
      tx.objectStore(fx.storeName).put(fx.stats, 'mtg:stats');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('mtg:device-id', 'mock-played');
    set('Loading the played match…');
    location.replace('/?fresh=' + Date.now() + '#/daily');
  } catch (err) {
    set('Could not seed the played match: ' + err.message);
  }
})();
</script>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  console.log(`${req.method} ${url.pathname}${url.search}`);

  // ---- control
  if (url.pathname === '/mock') return send(res, 200, controlPage(), { 'Content-Type': TYPES['.html'] });
  const sel = /^\/mock\/select\/([\w-]+)(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(url.pathname);
  if (sel) {
    if (!cards.has(sel[1])) return sendJson(res, 404, { error: 'unknown scenario' });
    activeId = sel[1];
    if (sel[2]) activeDate = sel[2];
    statsByDay.clear();
    seenDevices.clear();
    console.log(`  → active card is now ${activeId}`);
    // The app caches the day's answer (and the game) client-side, so a plain
    // redirect would keep showing the previous card. Clear everything first,
    // then navigate; a 302 can't do that, hence this page.
    return send(res, 200, clearingPage(sel[1]), { 'Content-Type': TYPES['.html'] });
  }

  // ---- pre-played match fixture
  if (url.pathname === '/mock/played') {
    activeId = PLAYED.target;
    if (!playedFixture()) return sendJson(res, 503, { error: 'played-match cards not loaded' });
    return send(res, 200, playedPage(), { 'Content-Type': TYPES['.html'] });
  }
  if (url.pathname === '/mock/fixture/played') {
    const fixture = playedFixture();
    return fixture
      ? sendJson(res, 200, fixture)
      : sendJson(res, 503, { error: 'played-match cards not loaded' });
  }

  // ---- api
  const daily = /^\/api\/daily\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
  if (daily) {
    // Any date but the mock's "today" 302s to it, so the client's final-URL
    // day-key logic is exercised (backend §3.4).
    const today = activeDate;
    if (daily[1] !== today) {
      return send(res, 302, '', { Location: `/api/daily/${today}` });
    }
    const card = cards.get(activeId);
    if (!card) return sendJson(res, 500, { error: 'no card loaded' });
    const envelope = JSON.stringify({
      card,
      reveal: selectReveal(today, card),
      generated_at: new Date().toISOString(),
    });
    // Pre-gzipped, and deliberately no Content-Encoding (backend §3.4).
    return send(res, 200, gzip(Buffer.from(envelope)), { 'Content-Type': 'application/json' });
  }

  if (url.pathname === '/api/stats' && req.method === 'POST') {
    const body = await readBody(req);
    let record;
    try {
      record = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'bad json' });
    }
    const { date, outcome, guesses, hintsUsed, deviceId } = record ?? {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !['won', 'lost', 'abandoned'].includes(outcome)) {
      return sendJson(res, 400, { error: 'invalid record' });
    }
    const key = `${date}:${deviceId}`;
    if (!seenDevices.has(key)) {
      seenDevices.add(key);
      const s = statsFor(date);
      if (outcome === 'won') {
        s.won += 1;
        const slot = s.byGuesses[String(guesses)] ?? (s.byGuesses[String(guesses)] = { plain: 0, hint: 0 });
        if (hintsUsed > 0) slot.hint += 1;
        else slot.plain += 1;
      } else if (outcome === 'lost') s.lost += 1;
      else s.abandoned += 1;
    }
    // No `target`, ever (§4.5).
    return sendJson(res, 200, statsFor(date));
  }

  const statsDay = /^\/api\/stats\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
  if (statsDay) return sendJson(res, 200, statsFor(statsDay[1]));

  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });

  // ---- static dist
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(DIST, file);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    // SPA fallback: unknown paths get the shell.
    return send(res, 200, fs.readFileSync(path.join(DIST, 'index.html')), {
      'Content-Type': TYPES['.html'],
    });
  }
  send(res, 200, fs.readFileSync(full), {
    'Content-Type': TYPES[path.extname(full)] ?? 'application/octet-stream',
  });
});

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`No build at ${DIST}/index.html — run npm run build first.`);
  process.exit(1);
}

await prefetchCards();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`mock on http://127.0.0.1:${PORT}  (control page: /mock)`);
  console.log(`cards loaded: ${[...cards.keys()].join(', ') || 'none'}`);
  console.log(`active card: ${activeId}`);
});
