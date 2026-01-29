/**
 * Global test setup for Vitest
 * Runs before all tests
 */

import { vi } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set default test environment variables if not provided
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-dummy';
}

if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = 'test-gemini-key-dummy';
}

// Global test utilities
global.mockConsoleLog = () => {
  return vi.spyOn(console, 'log').mockImplementation(() => {});
};

global.mockConsoleError = () => {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
};

global.restoreConsole = () => {
  vi.restoreAllMocks();
};

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
