#!/usr/bin/env node

/**
 * Kanban Server Startup Script
 * Used by BackgroundProcessManager to start the kanban server
 */

import { KanbanServer } from './index.js';
import path from 'path';

// Get project root from command line argument
const projectRoot = process.argv[2] || process.cwd();
const port = process.argv[3] ? parseInt(process.argv[3]) : 4174;

console.log(`Starting AVC Kanban Server...`);
console.log(`Project root: ${projectRoot}`);
console.log(`Port: ${port}`);

const server = new KanbanServer(projectRoot, { port });

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down kanban server...');
  await server.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.start().then(() => {
  // When launched as a fork of the AVC CLI, wire incoming relay messages so that
  // ceremony worker events (forwarded by the CLI) reach CeremonyService.
  if (process.connected) {
    process.on('message', (msg) => {
      if (msg.type === 'ceremony:worker-msg') {
        server.ceremonyService.handleWorkerMessage(msg.processId, msg.msg);
      } else if (msg.type === 'ceremony:worker-exit') {
        server.ceremonyService.handleWorkerExit(msg.processId, msg.code);
      } else if (msg.type === 'ceremony:started') {
        server.ceremonyService.handleWorkerStarted(msg.processId, msg.pid);
      }
    });
  }
}).catch((error) => {
  console.error('Failed to start kanban server:', error);
  process.exit(1);
});
