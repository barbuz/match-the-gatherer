import { describe, it, expect, vi, afterEach } from 'vitest';
import { countSearchResults } from '../src/lib/api/scryfall.js';

/** A Response stand-in whose body streams the given byte chunks. */
function streamResponse(chunks, { status = 200, ok = true, onCancel } = {}) {
  let i = 0;
  let reads = 0;
  const body = {
    getReader() {
      return {
        async read() {
          reads += 1;
          if (i < chunks.length) return { value: chunks[i++], done: false };
          return { value: undefined, done: true };
        },
        async cancel() {
          onCancel?.();
        },
      };
    },
  };
  return {
    status,
    ok,
    body,
    get reads() {
      return reads;
    },
    text: async () => Buffer.concat(chunks).toString(),
  };
}

const HEAD = Buffer.from(
  '{"object":"list","total_cards":32028,"has_more":true,"next_page":"…","data":[',
);
const TAIL = Buffer.from('{"object":"card","name":"…"}]}');

afterEach(() => vi.unstubAllGlobals());

describe('countSearchResults', () => {
  it('reads total_cards from the first chunk and cancels the rest', async () => {
    let canceled = false;
    const res = streamResponse([HEAD, TAIL], { onCancel: () => (canceled = true) });
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal('fetch', fetchMock);

    const total = await countSearchResults('t:creature f:v not:reprint');

    expect(total).toBe(32028);
    // Only the opening chunk was pulled; the full page was never downloaded.
    expect(res.reads).toBe(1);
    expect(canceled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.scryfall.com/cards/search?q=t%3Acreature%20f%3Av%20not%3Areprint',
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.any(String) }) }),
    );
  });

  it('maps Scryfall\u2019s 404 no-match response to 0', async () => {
    const res = { status: 404, ok: false, body: null, text: async () => '{}' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    expect(await countSearchResults('t:creature pow=9999 f:v')).toBe(0);
  });

  it('throws on any other non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 500, ok: false, body: null, text: async () => '' }),
    );

    await expect(countSearchResults('t:creature')).rejects.toThrow('HTTP 500');
  });

  it('falls back to the full text when the response has no stream', async () => {
    const res = {
      status: 200,
      ok: true,
      body: null,
      text: async () => '{"object":"list","total_cards":7,"data":[]}',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    expect(await countSearchResults('f:v not:reprint')).toBe(7);
  });

  it('throws when the body never carries total_cards', async () => {
    const res = streamResponse([Buffer.from('{"object":"error"}')]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    await expect(countSearchResults('f:v')).rejects.toThrow('no total_cards');
  });

  it('passes the abort signal through and rejects when the caller cancels', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, { signal } = {}) => {
      expect(signal).toBe(controller.signal);
      controller.abort(); // simulate the player moving on mid-request
      return Promise.reject(signal.reason);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      countSearchResults('t:creature f:v', { signal: controller.signal }),
    ).rejects.toBe(controller.signal.reason);
  });
});
