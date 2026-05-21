// Known corporate domains that operate catch-all
// Update manually when users report false negatives
// Keep this list small and high-confidence only
export const KNOWN_CATCHALL_DOMAINS = new Set([
  // Large Brazilian corporate catch-alls (commonly reported)
  'embratel.com.br',
  'petrobras.com.br',
  // Add more as discovered via user feedback
]);
