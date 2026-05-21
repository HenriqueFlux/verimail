import emailSpellChecker from '@zootools/email-spell-checker';

// Brazilian domains not in the default list
const BR_DOMAINS = [
  'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br',
  'r7.com', 'globomail.com', 'hotmail.com.br', 'yahoo.com.br',
  'outlook.com.br',
];

const EXTENDED_DOMAINS = [...emailSpellChecker.POPULAR_DOMAINS, ...BR_DOMAINS];

// Extended TLD list that includes .com.br so it's recognized as a valid TLD
// and not confused with .com (which would create false positives for BR corporate domains)
const EXTENDED_TLDS = [
  ...emailSpellChecker.POPULAR_TLDS,
  'com.br', 'org.br', 'net.br', 'edu.br', 'gov.br', 'mil.br',
];

export interface TypoResult {
  suggestion: string | null;
}

export function checkTypo(email: string): TypoResult {
  const result = emailSpellChecker.run({
    email,
    domains: EXTENDED_DOMAINS,
    topLevelDomains: EXTENDED_TLDS,
  });
  return { suggestion: result ? result.full : null };
}
