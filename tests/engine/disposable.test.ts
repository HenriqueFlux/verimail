import { describe, it, expect } from 'vitest';
import { checkDisposable } from '../../src/engine/checks/disposable.js';

describe('checkDisposable', () => {
  it('returns true (disposable) for mailinator.com', () => {
    expect(checkDisposable('mailinator.com')).toBe(true);
  });

  it('returns true (disposable) for guerrillamail.com', () => {
    expect(checkDisposable('guerrillamail.com')).toBe(true);
  });

  it('returns false (not disposable) for gmail.com', () => {
    expect(checkDisposable('gmail.com')).toBe(false);
  });

  it('returns false (not disposable) for uol.com.br', () => {
    expect(checkDisposable('uol.com.br')).toBe(false);
  });

  it('handles lowercase domain correctly', () => {
    expect(checkDisposable('mailinator.com')).toBe(true);
  });
});
