/**
 * Global test setup for Vitest
 * Runs before all tests
 */

import { vi } from 'vitest';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';

// Load test environment variables
// Try .env.test first, fall back to .env if it exists
const envTestPath = path.resolve(process.cwd(), '.env.test');
const envPath = path.resolve(process.cwd(), '.env');

if (existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
} else if (existsSync(envPath)) {
  // Fall back to .env if .env.test doesn't exist
  dotenv.config({ path: envPath });
}

// Set default test environment variables if not provided
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key-dummy';
}

if (!process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = 'test-gemini-key-dummy';
}

// Helper to check if we have real API keys
global.hasRealApiKeys = () => {
  return process.env.ANTHROPIC_API_KEY !== 'test-anthropic-key-dummy' &&
         !process.env.ANTHROPIC_API_KEY.includes('dummy');
};

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
