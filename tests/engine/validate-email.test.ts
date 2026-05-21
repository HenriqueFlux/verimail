import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateEmail } from '../../src/engine/index.js';

describe('validateEmail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Pipeline priority tests

  it('returns invalid with reason syntax for malformed email', async () => {
    const result = await validateEmail('not-an-email');
    expect(result.status).toBe('invalid');
    expect(result.score).toBe(100);
    expect(result.reason).toBe('syntax');
    expect(result.email).toBe('not-an-email');
  });

  it('returns invalid with reason role before checking disposable (role prefix on disposable domain)', async () => {
    // info@mailinator.com — role should fire before disposable
    const result = await validateEmail('info@mailinator.com');
    expect(result.status).toBe('invalid');
    expect(result.score).toBe(100);
    expect(result.reason).toBe('role');
  });

  it('returns invalid with reason disposable before checking typo', async () => {
    // user@mailinator.com — disposable should fire before typo
    const result = await validateEmail('user@mailinator.com');
    expect(result.status).toBe('invalid');
    expect(result.score).toBe(100);
    expect(result.reason).toBe('disposable');
  });

  it('returns invalid with reason typo and includes full email suggestion', async () => {
    const result = await validateEmail('user@gamil.com');
    expect(result.status).toBe('invalid');
    expect(result.score).toBe(100);
    expect(result.reason).toBe('typo');
    expect(result.suggestion).toBe('user@gmail.com');
  });

  it('returns risky for catch-all curated domain (skips MX call)', async () => {
    // fetch should NOT be called for curated catch-all domains
    const result = await validateEmail('user@embratel.com.br');
    expect(result.status).toBe('risky');
    expect(result.score).toBe(50);
    expect(result.reason).toBe('catch-all');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns invalid with reason no-domain for NXDOMAIN', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 3 }),
    } as Response);

    const result = await validateEmail('user@nxdomain.invalid');
    expect(result.status).toBe('invalid');
    expect(result.score).toBe(100);
    expect(result.reason).toBe('no-domain');
  });

  it('returns invalid with reason no-mx for domain without MX', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Status: 0, Answer: [] }),
    } as Response);

    const result = await validateEmail('user@nomx.example.com');
    expect(result.status).toBe('invalid');
    expect(result.score).toBe(100);
    expect(result.reason).toBe('no-mx');
  });

  it('returns risky for domain with own MX server (heuristic)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 mail.empresa.com.br.' }],
      }),
    } as Response);

    const result = await validateEmail('user@empresa.com.br');
    expect(result.status).toBe('risky');
    expect(result.score).toBe(50);
    expect(result.reason).toBe('catch-all');
  });

  it('returns valid for email with Gmail MX', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 aspmx.l.google.com.' }],
      }),
    } as Response);

    const result = await validateEmail('valid@gmail.com');
    expect(result.status).toBe('valid');
    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  // Score model assertions

  it('score is 100 for all invalid results', async () => {
    const syntaxResult = await validateEmail('not-an-email');
    expect(syntaxResult.score).toBe(100);
    expect(syntaxResult.status).toBe('invalid');

    const roleResult = await validateEmail('admin@example.com');
    expect(roleResult.score).toBe(100);
    expect(roleResult.status).toBe('invalid');
  });

  it('score is 50 for all risky results', async () => {
    const result = await validateEmail('user@embratel.com.br');
    expect(result.score).toBe(50);
    expect(result.status).toBe('risky');
  });

  it('score is 0 for valid results', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 aspmx.l.google.com.' }],
      }),
    } as Response);

    const result = await validateEmail('valid@gmail.com');
    expect(result.score).toBe(0);
    expect(result.status).toBe('valid');
  });

  it('reason is null only for valid results', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [{ data: '10 aspmx.l.google.com.' }],
      }),
    } as Response);

    const validResult = await validateEmail('valid@gmail.com');
    expect(validResult.reason).toBeNull();

    const invalidResult = await validateEmail('not-an-email');
    expect(invalidResult.reason).not.toBeNull();
  });

  it('suggestion field only present when reason is typo', async () => {
    const typoResult = await validateEmail('user@gamil.com');
    expect(typoResult.reason).toBe('typo');
    expect(typoResult.suggestion).toBeDefined();

    const syntaxResult = await validateEmail('not-an-email');
    expect(syntaxResult.reason).toBe('syntax');
    expect(syntaxResult.suggestion).toBeUndefined();
  });
});
