import { describe, it, expect } from 'vitest';
import { checkTypo } from '../../src/engine/checks/typo.js';

describe('checkTypo', () => {
  it('detects gamil.com as typo and suggests full corrected email', () => {
    const result = checkTypo('user@gamil.com');
    expect(result.suggestion).toBe('user@gmail.com');
  });

  it('detects hotmal.com as typo and suggests full corrected email', () => {
    const result = checkTypo('user@hotmal.com');
    expect(result.suggestion).toBe('user@hotmail.com');
  });

  it('detects uool.com.br as typo and suggests full corrected email', () => {
    const result = checkTypo('user@uool.com.br');
    expect(result.suggestion).toBe('user@uol.com.br');
  });

  it('returns null suggestion for correct domain gmail.com', () => {
    const result = checkTypo('user@gmail.com');
    expect(result.suggestion).toBeNull();
  });

  it('returns null suggestion for correct domain outlook.com', () => {
    const result = checkTypo('user@outlook.com');
    expect(result.suggestion).toBeNull();
  });
});
