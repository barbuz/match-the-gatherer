import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDailyCard, DailyApiError } from '../src/lib/api/dailyApi.js';

const CARD = { name: 'Black Lotus', oracle_id: 'lotus', type_line: 'Artifact' };

function jsonResponse(body, { url = 'https://api/daily', ok = true, status = 200 } = {}) {
  return { ok, status, url, json: async () => body };
}

describe('fetchDailyCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the day's dated URL and returns the server's card", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ card: CARD, generated_at: '2026-09-15T00:00:00Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { card, dayKey } = await fetchDailyCard('2026-09-15');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://match-the-gatherer.barbuz.workers.dev/api/daily/2026-09-15',
    );
    expect(card).toEqual(CARD);
    expect(dayKey).toBe('2026-09-15');
  });

  it('adopts the date from the final URL after the server redirects', async () => {
    // A clock-skewed client asks for the 14th while the server is on the 15th;
    // the backend 302s to today, and the game must persist under the served day.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { card: CARD },
          { url: 'https://match-the-gatherer.barbuz.workers.dev/api/daily/2026-09-15' },
        ),
      ),
    );

    const { dayKey } = await fetchDailyCard('2026-09-14');
    expect(dayKey).toBe('2026-09-15');
  });

  it('fails loudly on a network error, a bad status and a card-less body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 503 })));
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ card: {} })));
    await expect(fetchDailyCard('2026-09-15')).rejects.toBeInstanceOf(DailyApiError);
  });
});

describe('statsApi', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('posts the anonymous result with the app version and a stable device id', async () => {
    const store = {};
    vi.doMock('../src/lib/storage/db.js', () => ({
      dbGet: vi.fn(async (k) => store[k]),
      dbSet: vi.fn(async (k, v) => {
        store[k] = v;
      }),
    }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ date: '2026-09-15', won: 2 }));
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
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      date: '2026-09-15',
      outcome: 'won',
      guesses: 4,
      hintsUsed: 2,
      clientVersion: expect.any(String),
      deviceId: expect.any(String),
    });
    // Persisted once, so the same install always reports the same id.
    expect(await getDeviceId()).toBe(body.deviceId);
  });

  it('never throws: an offline sink or an error status resolves to null', async () => {
    vi.doMock('../src/lib/storage/db.js', () => ({
      dbGet: vi.fn(async () => null),
      dbSet: vi.fn(async () => {}),
    }));
    const { reportDailyResult } = await import('../src/lib/api/statsApi.js');
    const payload = { date: '2026-09-15', outcome: 'lost', guesses: 10, hintsUsed: 0 };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(reportDailyResult(payload)).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 429 })));
    await expect(reportDailyResult(payload)).resolves.toBeNull();
  });
});