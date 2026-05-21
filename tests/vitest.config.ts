import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/engine/**/*.test.ts'],
    environment: 'node',
    // NO @cloudflare/vitest-pool-workers pool here
    // Engine tests mock fetch via vi.stubGlobal('fetch', mockFn)
  },
});
