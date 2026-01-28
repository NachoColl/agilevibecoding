#!/usr/bin/env node

import { startRepl, executeCommand } from './repl-ink.js';

/**
 * AVC CLI - Main entry point
 *
 * Supports both interactive REPL mode and direct command execution
 *
 * Usage:
 *   avc           - Start interactive REPL
 *   avc help      - Show help and exit
 *   avc init      - Run init command and exit
 *   avc status    - Run status command and exit
 */

const args = process.argv.slice(2);

if (args.length === 0) {
  // No arguments - start interactive REPL
  startRepl();
} else {
  // Command provided - execute non-interactively
  const command = args[0].startsWith('/') ? args[0] : `/${args[0]}`;
  executeCommand(command).catch(() => {
    process.exit(1);
  });
}
