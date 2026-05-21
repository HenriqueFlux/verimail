import { ROLE_PREFIXES } from '../data/role-prefixes.js';

export function checkRole(email: string): { valid: boolean } {
  const local = email.split('@')[0].toLowerCase();
  return { valid: !ROLE_PREFIXES.has(local) };
}
