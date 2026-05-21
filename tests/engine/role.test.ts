import { describe, it, expect } from 'vitest';
import { checkRole } from '../../src/engine/checks/role.js';

describe('checkRole', () => {
  it('returns valid=false for info@ prefix', () => {
    expect(checkRole('info@example.com')).toEqual({ valid: false });
  });

  it('returns valid=false for sac@ prefix', () => {
    expect(checkRole('sac@example.com')).toEqual({ valid: false });
  });

  it('returns valid=false for contato@ prefix', () => {
    expect(checkRole('contato@example.com')).toEqual({ valid: false });
  });

  it('returns valid=false for noreply@ prefix', () => {
    expect(checkRole('noreply@example.com')).toEqual({ valid: false });
  });

  it('returns valid=false for admin@ prefix', () => {
    expect(checkRole('admin@example.com')).toEqual({ valid: false });
  });

  it('returns valid=true for regular user@ prefix', () => {
    expect(checkRole('user@example.com')).toEqual({ valid: true });
  });

  it('returns valid=true for name-based email', () => {
    expect(checkRole('joao.silva@example.com')).toEqual({ valid: true });
  });

  it('returns valid=false for case-insensitive role prefix (INFO@)', () => {
    expect(checkRole('INFO@example.com')).toEqual({ valid: false });
  });
});
