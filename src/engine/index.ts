import type { ValidationResult } from './types.js';
import { checkSyntax } from './checks/syntax.js';
import { checkRole } from './checks/role.js';
import { checkDisposable } from './checks/disposable.js';
import { checkTypo } from './checks/typo.js';
import { checkCatchAllCurated } from './checks/catchall.js';
import { checkMx } from './checks/mx.js';

export async function validateEmail(email: string): Promise<ValidationResult> {
  // Step 1: Syntax check (pure, ~0.01ms)
  const syntaxResult = checkSyntax(email);
  if (!syntaxResult.valid) {
    return { email, status: 'invalid', score: 100, reason: 'syntax' };
  }

  // Normalize domain to lowercase after syntax check
  const domain = email.split('@')[1].toLowerCase();

  // Step 2: Role-based check (pure, ~0.01ms)
  const roleResult = checkRole(email);
  if (!roleResult.valid) {
    return { email, status: 'invalid', score: 100, reason: 'role' };
  }

  // Step 3: Disposable check (pure, O(1) Set lookup)
  if (checkDisposable(domain)) {
    return { email, status: 'invalid', score: 100, reason: 'disposable' };
  }

  // Step 4: Typo check (pure, Sift3 in-memory)
  const typoResult = checkTypo(email);
  if (typoResult.suggestion) {
    return { email, status: 'invalid', score: 100, reason: 'typo', suggestion: typoResult.suggestion };
  }

  // Step 5: Catch-all curated list check (pure, O(1) Set lookup — skips MX call entirely)
  if (checkCatchAllCurated(domain)) {
    return { email, status: 'risky', score: 50, reason: 'catch-all' };
  }

  // Step 6 & 7: MX lookup (async, DoH fetch) + MX provider heuristic
  const mxResult = await checkMx(domain);

  if (!mxResult.hasDomain) {
    return { email, status: 'invalid', score: 100, reason: 'no-domain' };
  }

  if (!mxResult.hasMx) {
    return { email, status: 'invalid', score: 100, reason: 'no-mx' };
  }

  if (mxResult.isCatchAllHeuristic) {
    return { email, status: 'risky', score: 50, reason: 'catch-all' };
  }

  // Step 8: All clear
  return { email, status: 'valid', score: 0, reason: null };
}
