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
server.start().catch((error) => {
  console.error('Failed to start kanban server:', error);
  process.exit(1);
});
