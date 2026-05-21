import { describe, it, expect } from 'vitest';
import { checkSyntax } from '../../src/engine/checks/syntax.js';

describe('checkSyntax', () => {
  it('returns valid=true for a standard email address', () => {
    expect(checkSyntax('user@example.com')).toEqual({ valid: true });
  });

  it('returns valid=false for email missing @', () => {
    expect(checkSyntax('userexample.com')).toEqual({ valid: false });
  });

  it('returns valid=false for email with no domain part', () => {
    expect(checkSyntax('user@')).toEqual({ valid: false });
  });

  it('returns valid=false for email longer than 254 characters', () => {
    const longLocal = 'a'.repeat(64);
    const longDomain = 'b'.repeat(186) + '.com';
    const longEmail = `${longLocal}@${longDomain}`;
    expect(longEmail.length).toBeGreaterThan(254);
    expect(checkSyntax(longEmail)).toEqual({ valid: false });
  });

  it('returns valid=false for local-part longer than 64 characters', () => {
    const longLocal = 'a'.repeat(65);
    expect(checkSyntax(`${longLocal}@example.com`)).toEqual({ valid: false });
  });

  it('returns valid=false for consecutive dots in local-part', () => {
    expect(checkSyntax('user..name@example.com')).toEqual({ valid: false });
  });

  it('returns valid=true for email with + tag', () => {
    expect(checkSyntax('user+tag@example.com')).toEqual({ valid: true });
  });

  it('returns valid=true for email with subdomain', () => {
    expect(checkSyntax('user@sub.example.com')).toEqual({ valid: true });
  });

  it('returns valid=true for email with hyphens', () => {
    expect(checkSyntax('user-name@my-domain.com')).toEqual({ valid: true });
  });
});
