import { isDisposableEmailDomain } from 'disposable-email-domains-js';

export function checkDisposable(domain: string): boolean {
  return isDisposableEmailDomain(domain);
}
