import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import net from 'net';
import http from 'http';

const execAsync = promisify(exec);

/**
 * Kanban Server Manager
 * Manages lifecycle of the AVC Kanban Board server
 */
export class KanbanServerManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.avcDir = path.join(projectRoot, '.avc');
    this.avcProjectPath = path.join(this.avcDir, 'project');
  }

  /**
   * Check if .avc/project directory exists
   */
  hasWorkItems() {
    return fs.existsSync(this.avcProjectPath);
  }

  /**
   * Get kanban server port from avc.json config
   * Returns default port 4174 if not configured
   */
  getPort() {
    const configPath = path.join(this.avcDir, 'avc.json');

    if (!fs.existsSync(configPath)) {
      return 4174; // Default port
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.settings?.kanban?.port || 4174;
    } catch (error) {
      console.warn(`⚠️  Could not read port from avc.json: ${error.message}`);
      return 4174;
    }
  }

  /**
   * Check if a port is in use
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} - True if port is in use
   */
  async isPortInUse(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true); // Port is in use
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(false); // Port is available
      });

      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Check if the server on this port is the AVC Kanban Board
   * Makes HTTP request to /api/health and checks for AVC kanban response
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} - True if it's confirmed to be AVC kanban server
   */
  async isKanbanServer(port) {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/api/health`, {
        timeout: 2000,
      }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            // Check if it's our AVC kanban server
            const isKanban = json.projectRoot === this.projectRoot;
            resolve(isKanban);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => {
        resolve(false); // Can't connect or verify
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Find which process is using a port
   * Works cross-platform (Linux, macOS, Windows)
   * @param {number} port - Port number to check
   * @returns {Promise<{pid: number, command: string} | null>} - Process info or null if not found
   */
  async findProcessUsingPort(port) {
    try {
      let command;
      let parseOutput;

      if (process.platform === 'win32') {
        // Windows: netstat -ano | findstr :PORT
        command = `netstat -ano | findstr :${port}`;
        parseOutput = (output) => {
          const lines = output.split('\n');
          for (const line of lines) {
            if (
              line.includes(`0.0.0.0:${port}`) ||
              line.includes(`127.0.0.1:${port}`) ||
              line.includes(`[::]:${port}`)
            ) {
              const parts = line.trim().split(/\s+/);
              const pid = parseInt(parts[parts.length - 1]);
              if (pid && !isNaN(pid)) {
                return { pid, command: 'Unknown' };
              }
            }
          }
          return null;
        };
      } else {
        // Linux/macOS: lsof -i :PORT
        command = `lsof -i :${port} -t -sTCP:LISTEN`;
        parseOutput = (output) => {
          const pid = parseInt(output.trim());
          if (pid && !isNaN(pid)) {
            // Try to get process name
            try {
              const { execSync } = require('child_process');
              const psOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
              return { pid, command: psOutput.trim() };
            } catch {
              return { pid, command: 'Unknown' };
            }
          }
          return null;
        };
      }

      const { stdout } = await execAsync(command);
      return parseOutput(stdout);
    } catch (error) {
      // Command failed (no process found) or permission error
      return null;
    }
  }

  /**
   * Kill a process by PID
   * @param {number} pid - Process ID to kill
   * @returns {Promise<boolean>} - True if kill succeeded
   */
  async killProcess(pid) {
    try {
      if (process.platform === 'win32') {
        await execAsync(`taskkill /F /PID ${pid}`);
      } else {
        await execAsync(`kill -9 ${pid}`);
      }
      return true;
    } catch (error) {
      console.error(`Failed to kill process ${pid}:`, error.message);
      return false;
    }
  }

  /**
   * Get the frontend dev server URL (Vite)
   * @returns {string} Frontend URL
   */
  getFrontendUrl() {
    const config = this.getConfig();
    const frontendPort = config.settings?.kanban?.frontendPort || 5173;
    return `http://localhost:${frontendPort}`;
  }

  /**
   * Get the backend API server URL
   * @returns {string} Backend URL
   */
  getBackendUrl() {
    const port = this.getPort();
    return `http://localhost:${port}`;
  }

  /**
   * Get AVC configuration
   * @returns {object} Configuration object
   */
  getConfig() {
    const configPath = path.join(this.avcDir, 'avc.json');

    if (!fs.existsSync(configPath)) {
      return { settings: {} };
    }

    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.warn(`⚠️  Could not read avc.json: ${error.message}`);
      return { settings: {} };
    }
  }
}
