import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/kanban/client/**',  // Kanban client has its own test config with jsdom
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['cli/**/*.js'],
      exclude: [
        'cli/index.js',  // Entry point, tested via integration
        'cli/templates/**',  // Template files
        'cli/repl-ink.js',  // UI code, tested manually
        'cli/repl-old.js',  // Legacy REPL
        'cli/update-checker.js',  // Update utilities
        'cli/node-package-installer.js',
        'cli/update-notifier.js',
        'tests/**',
        'kanban/client/**'  // Kanban client tested separately
      ],
      thresholds: {
        lines: 50,
        functions: 60,
        branches: 50,
        statements: 50
      }
    },
    testTimeout: 10000,  // Some tests may call APIs
    hookTimeout: 10000
  }
});
