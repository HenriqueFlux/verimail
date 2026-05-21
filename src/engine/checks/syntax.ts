// RFC 5321 §4.1.2: local-part max 64 chars, total max 254 chars
// Local-part: [a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]
// Domain: labels separated by dots, valid chars [a-zA-Z0-9-]
// Note: consecutive dots are handled by the regex (no .. in local-part)
const EMAIL_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function checkSyntax(email: string): { valid: boolean } {
  if (email.length > 254) return { valid: false };
  if (!email.includes('@')) return { valid: false };

  const atIndex = email.lastIndexOf('@');
  const localPart = email.substring(0, atIndex);

  if (localPart.length > 64) return { valid: false };

  return { valid: EMAIL_REGEX.test(email) };
}
