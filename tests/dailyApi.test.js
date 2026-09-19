import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';

const CARD = { name: 'Black Lotus', oracle_id: 'lotus', type_line: 'Artifact' };
const OTHER = { name: 'Grizzly Bears', oracle_id: 'bears' };

/** Minimal Response stand-in whose body is real bytes, as `fetch` delivers. */
function response(bytes, { url = 'https://api/daily', ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    url,
    arrayBuffer: async () => bytes,
    // `/api/stats` is negotiated normally (no manual encoding), so it parses here.
    json: async () => JSON.parse(bytes.toString()),
  };
}

const plain = (body) => response(Buffer.from(JSON.stringify(body)));
const gzipped = (body) => response(gzipSync(Buffer.from(JSON.stringify(body))));

/** In-memory stand-in for the idb-keyval wrapper the clients persist through. */
function stubDb() {
  const store = {};
  vi.doMock('../src/lib/storage/db.js', () => ({
    dbGet: vi.fn(async (k) => store[k] ?? null),
    dbSet: vi.fn(async (k, v) => {
      store[k] = v;
    }),
  }));
  return store;
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('fetchDailyCard', () => {
  it("requests the day's dated URL and returns the server's card", async () => {
    stubDb();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(plain({ card: CARD, generated_at: '2026-09-15T00:00:00Z' }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchDailyCard } = await import('../src/lib/api/dailyApi.js');

    const { card, dayKey } = await fetchDailyCard('2026-09-15');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://match-the-gatherer.barbuz.workers.dev/api/daily/2026-09-15',
    );
    expect(card).toEqual(CARD);
    expect(dayKey).toBe('2026-09-15');
  });

  it('inflates the pre-gzipped body the backend sends without Content-Encoding', async () => {
    // The real backend serves gzip bytes with no `Content-Encoding` on purpose
    // (backend spec §3.4), so `res.json()` cannot be used here.
    stubDb();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gzipped({ card: CARD })));
    const { fetchDailyCard } = await import('../src/lib/api/dailyApi.js');

    const { card } = await fetchDailyCard('2026-09-15');
    expect(card).toEqual(CARD);
  });

  it('adopts the date from the final URL after the server redirects', async () => {
    // A clock-skewed client asks for the 14th while the server is on the 15th;
    // the backend 302s to today, and the game must persist under the served day.
    stubDb();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(Buffer.from(JSON.stringify({ card: CARD })), {
          url: 'https://match-the-gatherer.barbuz.workers.dev/api/daily/2026-09-15',
        }),
      ),
    );
    const { fetchDailyCard } = await import('../src/lib/api/dailyApi.js');

    const { dayKey } = await fetchDailyCard('2026-09-14');
    expect(dayKey).toBe('2026-09-15');
  });

  it("serves the cached card for the same day without a second request", async () => {
    const store = stubDb();
    const fetchMock = vi.fn().mockResolvedValue(plain({ card: CARD }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchDailyCard } = await import('../src/lib/api/dailyApi.js');

    await fetchDailyCard('2026-09-15');
    const again = await fetchDailyCard('2026-09-15');

    expect(again.card).toEqual(CARD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store['mtg:daily-card']).toEqual({ dayKey: '2026-09-15', card: CARD });
  });

  it('re-requests once the day rolls over rather than serving yesterday', async () => {
    stubDb();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(plain({ card: CARD }))
      .mockResolvedValueOnce(plain({ card: OTHER }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchDailyCard } = await import('../src/lib/api/dailyApi.js');

    await fetchDailyCard('2026-09-15');
    const { card, dayKey } = await fetchDailyCard('2026-09-16');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(card).toEqual(OTHER);
    expect(dayKey).toBe('2026-09-16');
  });

  it('fails loudly on a network error, a bad status and a card-less body', async () => {
    stubDb();
    const { fetchDailyCard, DailyApiError } = await import('../src/lib/api/dailyApi.js');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(Buffer.from('{}'), { ok: false, status: 503 })),
    );
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(plain({ card: {} })));
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);

    // Gzip bytes that aren't valid JSON inside must not escape as a parse error.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(gzipSync(Buffer.from('not json')))));
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);
  });

  it('does not cache a failure, so a retry can still reach the server', async () => {
    stubDb();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(plain({ card: CARD }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchDailyCard } = await import('../src/lib/api/dailyApi.js');

    await expect(fetchDailyCard('2026-09-15')).rejects.toThrow();
    await expect(fetchDailyCard('2026-09-15')).resolves.toMatchObject({ card: CARD });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('statsApi', () => {
  it('posts the anonymous result with the app version and a stable device id', async () => {
    const store = stubDb();
    const fetchMock = vi.fn().mockResolvedValue(plain({ date: '2026-09-15', won: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    globalThis.crypto ??= {};
    globalThis.crypto.randomUUID ??= () => '11111111-2222-4333-8444-555555555555';

    const { reportDailyResult, getDeviceId } = await import('../src/lib/api/statsApi.js');
    const stats = await reportDailyResult({
      date: '2026-09-15',
      outcome: 'won',
      guesses: 4,
      hintsUsed: 2,
    });

    expect(stats).toEqual({ date: '2026-09-15', won: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://match-the-gatherer.barbuz.workers.dev/api/stats');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({
      date: '2026-09-15',
      outcome: 'won',
      guesses: 4,
      hintsUsed: 2,
      clientVersion: expect.any(String),
      deviceId: expect.any(String),
    });
    // Persisted once, so the same install always reports the same id.
    expect(await getDeviceId()).toBe(JSON.parse(init.body).deviceId);
    expect(store['mtg:device-id']).toBe(JSON.parse(init.body).deviceId);
  });

  it('never throws: an offline sink or an error status resolves to null', async () => {
    stubDb();
    const { reportDailyResult } = await import('../src/lib/api/statsApi.js');
    const payload = { date: '2026-09-15', outcome: 'lost', guesses: 10, hintsUsed: 0 };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(reportDailyResult(payload)).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(Buffer.from('{}'), { ok: false, status: 429 })),
    );
    await expect(reportDailyResult(payload)).resolves.toBeNull();
  });

  it('reads a concluded day back without posting (backend §4.4)', async () => {
    stubDb();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(plain({ date: '2026-09-15', won: 4, byGuesses: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchDailyStats } = await import('../src/lib/api/statsApi.js');
    const stats = await fetchDailyStats('2026-09-15');

    expect(stats).toEqual({ date: '2026-09-15', won: 4, byGuesses: {} });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://match-the-gatherer.barbuz.workers.dev/api/stats/2026-09-15');
    // A read, not a write: no method/body, so nothing is counted.
    expect(init?.method).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('fetchDailyStats never throws: offline or a non-2xx resolves to null', async () => {
    stubDb();
    const { fetchDailyStats } = await import('../src/lib/api/statsApi.js');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchDailyStats('2026-09-15')).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(Buffer.from('{}'), { ok: false, status: 404 })),
    );
    await expect(fetchDailyStats('2026-09-15')).resolves.toBeNull();
  });
});