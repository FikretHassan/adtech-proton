import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    // Disable optional modules in test (they use require() which breaks ESM)
    FEATURE_REFRESH: false,
    FEATURE_SEQUENCING: false,
    FEATURE_INJECTION: false,
    FEATURE_CUSTOM_SLOTS: false,
    FEATURE_EXPERIENCES: false,
    FEATURE_EXPERIMENTS: false,
    FEATURE_CUSTOM_FUNCTIONS: false,
    FEATURE_WRAPPERS: false,
    FEATURE_SRA_BATCHING: false,
    // Dynamic injection mode flags
    FEATURE_INJECTION_CHAR_MODE: true,
    FEATURE_INJECTION_BLOCK_MODE: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.d.ts', 'src/optional/**'],
      thresholds: {
        statements: 8,
        branches: 7,
        functions: 10,
        lines: 8
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
