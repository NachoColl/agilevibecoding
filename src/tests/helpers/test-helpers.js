import { vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get absolute path to a fixture file
 */
export function getFixturePath(filename) {
  return path.join(__dirname, '..', 'fixtures', filename);
}

/**
 * Create a mock file system structure
 */
export function createMockFileSystem(structure = {}) {
  const fs = {};

  // Default structure
  const defaultStructure = {
    '/tmp/test-project': null,
    '/tmp/test-project/.avc': null,
    '/tmp/test-project/.avc/project': null,
    ...structure
  };

  return defaultStructure;
}

/**
 * Suppress console output during tests
 */
export function suppressConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();

  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  };
}

/**
 * Wait for async operations to complete
 */
export async function waitFor(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock environment variables
 */
export function mockEnv(vars = {}) {
  const original = { ...process.env };

  Object.entries(vars).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  return () => {
    process.env = original;
  };
}

/**
 * Create a test project structure
 */
export function createTestProject() {
  return {
    projectName: 'test-project',
    framework: 'avc',
    created: new Date().toISOString(),
    settings: {
      contextScopes: ['epic', 'story', 'task', 'subtask'],
      workItemStatuses: [
        'ready',
        'pending',
        'implementing',
        'implemented',
        'testing',
        'completed',
        'blocked',
        'feedback'
      ],
      agentTypes: ['product-owner', 'server', 'client', 'infrastructure', 'testing'],
      ceremonies: [
        {
          name: 'sponsor-call',
          defaultModel: 'claude-sonnet-4-5-20250929',
          provider: 'claude'
        }
      ]
    }
  };
}
