import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import { FileSystemScanner } from './services/FileSystemScanner.js';
import { WorkItemReader } from './services/WorkItemReader.js';
import { HierarchyBuilder } from './services/HierarchyBuilder.js';
import { FileWatcher } from './services/FileWatcher.js';
import { createWorkItemsRouter } from './routes/work-items.js';
import { createCeremonyRouter } from './routes/ceremony.js';
import { createSettingsRouter } from './routes/settings.js';
import { createCostsRouter } from './routes/costs.js';
import { setupWebSocket } from './routes/websocket.js';
import { renderMarkdown } from './utils/markdown.js';
import { CeremonyService } from './services/CeremonyService.js';

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

    // Path to pre-built React client
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.clientDistPath = path.join(__dirname, '..', 'client', 'dist');

    // Services
    this.scanner = new FileSystemScanner(projectRoot);
    this.reader = new WorkItemReader(projectRoot);
    this.hierarchyBuilder = new HierarchyBuilder();
    this.fileWatcher = new FileWatcher(projectRoot);

    // Data store
    this.hierarchy = null;

    // Ceremony service
    this.ceremonyService = new CeremonyService(projectRoot);

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
        origin: [`http://localhost:${this.port}`, 'http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
      })
    );

    // JSON body parser
    this.app.use(express.json());

    // Serve pre-built React client
    this.app.use(express.static(this.clientDistPath));

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

    // Manual reload endpoint
    this.app.post('/api/reload', async (req, res) => {
      try {
        await this.reloadWorkItems();
        const count = this.hierarchy ? this.hierarchy.items.size : 0;
        res.json({ status: 'ok', workItemCount: count });
        if (this.websocket) {
          this.websocket.broadcastRefresh();
        }
      } catch (error) {
        console.error('Error during manual reload:', error);
        res.status(500).json({ error: 'Reload failed', message: error.message });
      }
    });

    // Project-level doc.md and context.md (root .avc/project/ files)
    const projectPath = path.join(this.projectRoot, '.avc', 'project');

    const readProjectFile = async (filename) => {
      try {
        return await fs.readFile(path.join(projectPath, filename), 'utf8');
      } catch {
        return null;
      }
    };

    this.app.get('/api/project/doc', async (req, res) => {
      const md = await readProjectFile('doc.md');
      if (!md) return res.status(404).json({ error: 'Project doc.md not found' });
      res.send(renderMarkdown(md));
    });

    this.app.get('/api/project/doc/raw', async (req, res) => {
      const md = await readProjectFile('doc.md');
      if (!md) return res.status(404).json({ error: 'Project doc.md not found' });
      res.type('text/plain').send(md);
    });

    this.app.put('/api/project/doc', async (req, res) => {
      const { content } = req.body;
      if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
      await fs.writeFile(path.join(projectPath, 'doc.md'), content, 'utf8');
      res.json({ status: 'ok' });
    });

    this.app.get('/api/project/context', async (req, res) => {
      const md = await readProjectFile('context.md');
      if (!md) return res.status(404).json({ error: 'Project context.md not found' });
      res.send(renderMarkdown(md));
    });

    this.app.get('/api/project/context/raw', async (req, res) => {
      const md = await readProjectFile('context.md');
      if (!md) return res.status(404).json({ error: 'Project context.md not found' });
      res.type('text/plain').send(md);
    });

    this.app.put('/api/project/context', async (req, res) => {
      const { content } = req.body;
      if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
      await fs.writeFile(path.join(projectPath, 'context.md'), content, 'utf8');
      res.json({ status: 'ok' });
    });

    // Settings router (GET /api/settings + PUT sub-routes)
    const settingsRouter = createSettingsRouter(this.projectRoot);
    this.app.use('/api/settings', settingsRouter);

    // Board title setting (read/write from avc.json)
    const avcJsonPath = path.join(this.projectRoot, '.avc', 'avc.json');
    const DEFAULT_TITLE = 'AVC Kanban Board';

    const readAvcConfig = async () => {
      try {
        return JSON.parse(await fs.readFile(avcJsonPath, 'utf8'));
      } catch {
        return {};
      }
    };

    this.app.get('/api/settings/title', async (req, res) => {
      const config = await readAvcConfig();
      res.json({ title: config?.settings?.kanban?.title || DEFAULT_TITLE });
    });

    this.app.get('/api/settings/docs-url', async (req, res) => {
      const config = await readAvcConfig();
      const docsPort = config?.settings?.documentation?.port || 4173;
      res.json({ url: `http://localhost:${docsPort}` });
    });

    this.app.put('/api/settings/title', async (req, res) => {
      const { title } = req.body;
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'title must be a non-empty string' });
      }
      try {
        const config = await readAvcConfig();
        if (!config.settings) config.settings = {};
        if (!config.settings.kanban) config.settings.kanban = {};
        config.settings.kanban.title = title.trim();
        await fs.writeFile(avcJsonPath, JSON.stringify(config, null, 2), 'utf8');
        res.json({ title: title.trim() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Work items routes
    const workItemsRouter = createWorkItemsRouter(this);
    this.app.use('/api/work-items', workItemsRouter);

    // Ceremony routes
    const ceremonyRouter = createCeremonyRouter(this.ceremonyService);
    this.app.use('/api/ceremony', ceremonyRouter);

    // Costs routes
    const costsRouter = createCostsRouter(this.projectRoot);
    this.app.use('/api/costs', costsRouter);

    // SPA fallback — serve index.html for any non-API GET
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(this.clientDistPath, 'index.html'));
    });

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

    // Watch doc.md for changes → sync to .avc/documentation/index.md
    // so vitepress dev picks up the change and hot-reloads the browser
    const docMdPath = path.join(this.projectRoot, '.avc', 'project', 'doc.md');
    const docsIndexPath = path.join(this.projectRoot, '.avc', 'documentation', 'index.md');

    const docWatcher = chokidar.watch(docMdPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 2000,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    docWatcher.on('change', async () => {
      try {
        const docsDir = path.join(this.projectRoot, '.avc', 'documentation');
        const docsDirExists = await fs.access(docsDir).then(() => true).catch(() => false);
        if (!docsDirExists) return; // documentation not set up yet
        const content = await fs.readFile(docMdPath, 'utf8');
        await fs.writeFile(docsIndexPath, content, 'utf8');
        console.log('[doc-watcher] Synced doc.md → documentation/index.md');
      } catch (err) {
        console.error('[doc-watcher] Sync failed:', err.message);
      }
    });

    docWatcher.on('error', (err) => {
      console.error('[doc-watcher] Error:', err.message);
    });
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

      // Wire ceremony service to WebSocket for broadcasting
      this.ceremonyService.setWebSocket(this.websocket);

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
