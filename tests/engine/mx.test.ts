import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkMx } from '../../src/engine/checks/mx.js';

describe('checkMx', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns hasDomain=false for NXDOMAIN (Status: 3)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 3 }),
    } as Response);

    const result = await checkMx('notareal-domain-xyz.com');
    expect(result.hasDomain).toBe(false);
    expect(result.hasMx).toBe(false);
    expect(result.isCatchAllHeuristic).toBe(false);
    expect(result.mxHosts).toEqual([]);
  });

  it('returns hasMx=false when Answer array is empty', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 0, Answer: [] }),
    } as Response);

    const result = await checkMx('no-mx-domain.com');
    expect(result.hasDomain).toBe(true);
    expect(result.hasMx).toBe(false);
    expect(result.isCatchAllHeuristic).toBe(false);
  });

  it('returns isCatchAllHeuristic=false for Gmail MX', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 aspmx.l.google.com.' }],
      }),
    } as Response);

    const result = await checkMx('example.com');
    expect(result.hasDomain).toBe(true);
    expect(result.hasMx).toBe(true);
    expect(result.isCatchAllHeuristic).toBe(false);
  });

  it('returns isCatchAllHeuristic=true for own MX server', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 mail.empresa.com.br.' }],
      }),
    } as Response);

    const result = await checkMx('empresa.com.br');
    expect(result.hasDomain).toBe(true);
    expect(result.hasMx).toBe(true);
    expect(result.isCatchAllHeuristic).toBe(true);
  });

  it('returns hasDomain=false on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await checkMx('example.com');
    expect(result.hasDomain).toBe(false);
    expect(result.hasMx).toBe(false);
    expect(result.isCatchAllHeuristic).toBe(false);
    expect(result.mxHosts).toEqual([]);
  });

  it('correctly parses MX data field stripping priority and trailing dot', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '20 alt1.aspmx.l.google.com.' }],
      }),
    } as Response);

    const result = await checkMx('example.com');
    expect(result.mxHosts).toEqual(['alt1.aspmx.l.google.com']);
    expect(result.isCatchAllHeuristic).toBe(false);
  });
});
