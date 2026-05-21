import { describe, it, expect } from 'vitest';
import { checkCatchAllCurated } from '../../src/engine/checks/catchall.js';

describe('checkCatchAllCurated', () => {
  it('returns true for domain in curated catch-all list', () => {
    expect(checkCatchAllCurated('embratel.com.br')).toBe(true);
  });

  it('returns false for domain not in curated catch-all list', () => {
    expect(checkCatchAllCurated('example.com')).toBe(false);
  });

  it('returns false for gmail.com', () => {
    expect(checkCatchAllCurated('gmail.com')).toBe(false);
  });
});
