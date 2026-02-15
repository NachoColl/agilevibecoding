import express from 'express';
import http from 'http';
import cors from 'cors';
import { FileSystemScanner } from './services/FileSystemScanner.js';
import { WorkItemReader } from './services/WorkItemReader.js';
import { HierarchyBuilder } from './services/HierarchyBuilder.js';
import { FileWatcher } from './services/FileWatcher.js';
import { createWorkItemsRouter } from './routes/work-items.js';
import { setupWebSocket } from './routes/websocket.js';

/**
 * KanbanServer
 * Express server for AVC Kanban Board
 */
export class KanbanServer {
  /**
   * @param {string} projectRoot - Absolute path to project root directory
   * @param {object} options - Server options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.port = options.port || 4174;
    this.host = options.host || 'localhost';

    // Services
    this.scanner = new FileSystemScanner(projectRoot);
    this.reader = new WorkItemReader(projectRoot);
    this.hierarchyBuilder = new HierarchyBuilder();
    this.fileWatcher = new FileWatcher(projectRoot);

    // Data store
    this.hierarchy = null;

    // Express app
    this.app = express();
    this.server = null;
    this.websocket = null;

    // Setup middleware
    this.setupMiddleware();

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS for frontend development server
    this.app.use(
      cors({
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
      })
    );

    // JSON body parser
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        projectRoot: this.projectRoot,
      });
    });

    // Statistics
    this.app.get('/api/stats', (req, res) => {
      if (!this.hierarchy) {
        return res.status(503).json({ error: 'Data not loaded yet' });
      }

      const { items } = this.hierarchy;
      const allItems = Array.from(items.values());

      const stats = {
        total: allItems.length,
        byType: {},
        byStatus: {},
      };

      allItems.forEach((item) => {
        // Count by type
        const type = item._type;
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        // Count by status
        const status = item.status;
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      });

      res.json(stats);
    });

    // Work items routes
    const workItemsRouter = createWorkItemsRouter(this);
    this.app.use('/api/work-items', workItemsRouter);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Load work items from file system
   */
  async loadWorkItems() {
    console.log('Loading work items...');

    try {
      // Scan for work.json files
      const workFiles = await this.scanner.scan();
      console.log(`Found ${workFiles.length} work items`);

      if (workFiles.length === 0) {
        console.warn('No work items found in .avc/project/');
        this.hierarchy = { items: new Map(), roots: [] };
        return;
      }

      // Read all work items
      const workItems = await this.reader.readAllWorkItems(workFiles);
      console.log(`Successfully read ${workItems.length} work items`);

      // Build hierarchy
      this.hierarchy = this.hierarchyBuilder.buildHierarchy(workItems);
      console.log(`Built hierarchy with ${this.hierarchy.roots.length} root epics`);
    } catch (error) {
      console.error('Error loading work items:', error);
      throw error;
    }
  }

  /**
   * Setup file watcher for real-time updates
   */
  setupFileWatcher() {
    console.log('Setting up file watcher...');

    this.fileWatcher.on('ready', () => {
      console.log('File watcher ready');
    });

    this.fileWatcher.on('added', async (filePath) => {
      console.log(`Work item added: ${filePath}`);
      await this.reloadWorkItems();
      if (this.websocket) {
        this.websocket.broadcastRefresh();
      }
    });

    this.fileWatcher.on('changed', async (filePath) => {
      console.log(`Work item changed: ${filePath}`);
      await this.reloadWorkItems();
      if (this.websocket) {
        this.websocket.broadcastRefresh();
      }
    });

    this.fileWatcher.on('deleted', async (filePath) => {
      console.log(`Work item deleted: ${filePath}`);
      await this.reloadWorkItems();
      if (this.websocket) {
        this.websocket.broadcastRefresh();
      }
    });

    this.fileWatcher.on('error', (error) => {
      console.error('File watcher error:', error);
    });

    this.fileWatcher.start();
  }

  /**
   * Reload work items from file system
   */
  async reloadWorkItems() {
    try {
      await this.loadWorkItems();
    } catch (error) {
      console.error('Error reloading work items:', error);
    }
  }

  /**
   * Get current hierarchy
   * @returns {object} Current hierarchy
   */
  getHierarchy() {
    return this.hierarchy || { items: new Map(), roots: [] };
  }

  /**
   * Get full details for a work item
   * @param {object} item - Work item
   * @returns {Promise<object>} Full details
   */
  async getFullDetails(item) {
    return await this.reader.getFullDetails(item);
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Load initial data
      await this.loadWorkItems();

      // Create HTTP server
      this.server = http.createServer(this.app);

      // Setup WebSocket
      this.websocket = setupWebSocket(this.server, this);

      // Setup file watcher
      this.setupFileWatcher();

      // Start listening
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, this.host, (error) => {
          if (error) {
            reject(error);
          } else {
            console.log(`\nKanban server listening on http://${this.host}:${this.port}`);
            console.log(`WebSocket available at ws://${this.host}:${this.port}/ws`);
            console.log(`API endpoints:`);
            console.log(`  GET  /api/health`);
            console.log(`  GET  /api/stats`);
            console.log(`  GET  /api/work-items`);
            console.log(`  GET  /api/work-items/grouped`);
            console.log(`  GET  /api/work-items/:id`);
            console.log(`  GET  /api/work-items/:id/doc`);
            console.log(`  GET  /api/work-items/:id/context\n`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Error starting server:', error);
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    console.log('Stopping kanban server...');

    // Stop file watcher
    if (this.fileWatcher) {
      await this.fileWatcher.stop();
    }

    // Close WebSocket connections
    if (this.websocket && this.websocket.wss) {
      this.websocket.wss.clients.forEach((client) => {
        client.close();
      });
      this.websocket.wss.close();
    }

    // Close HTTP server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          console.log('Kanban server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Get server status
   * @returns {object} Server status
   */
  getStatus() {
    return {
      running: this.server !== null,
      port: this.port,
      host: this.host,
      workItemCount: this.hierarchy ? this.hierarchy.items.size : 0,
      websocketClients: this.websocket ? this.websocket.getClientCount() : 0,
    };
  }
}
