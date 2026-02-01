import { execSync, spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import net from 'net';
import http from 'http';

const execAsync = promisify(exec);

/**
 * Build and serve VitePress documentation
 * Builds the docs and starts a local preview server
 */
export class DocumentationBuilder {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.docsDir = path.join(projectRoot, '.avc', 'documentation');
    this.distDir = path.join(this.docsDir, '.vitepress', 'dist');
  }

  /**
   * Check if documentation directory exists
   */
  hasDocumentation() {
    return fs.existsSync(this.docsDir);
  }

  /**
   * Get documentation server port from avc.json config
   * Returns default port 4173 if not configured
   */
  getPort() {
    const configPath = path.join(this.projectRoot, '.avc', 'avc.json');

    if (!fs.existsSync(configPath)) {
      return 4173; // Default port
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.settings?.documentation?.port || 4173;
    } catch (error) {
      console.warn(`⚠️  Could not read port from avc.json: ${error.message}`);
      return 4173;
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
   * Check if the server on this port is serving our AVC documentation
   * Makes HTTP request and checks for specific AVC metatag to positively identify
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} - True if it's confirmed to be AVC documentation server
   */
  async isDocumentationServer(port) {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/`, {
        timeout: 2000
      }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // ONLY return true if we find the specific AVC documentation metatag
          // This ensures we only kill processes we're 100% certain about
          const hasAvcMetatag = data.includes('<meta name="avc-documentation" content="true">') ||
                                data.includes('name="avc-documentation"') ||
                                data.includes('name="generator" content="Agile Vibe Coding"');
          resolve(hasAvcMetatag);
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
            if (line.includes(`0.0.0.0:${port}`) || line.includes(`127.0.0.1:${port}`) || line.includes(`[::]:${port}`)) {
              const parts = line.trim().split(/\s+/);
              const pid = parseInt(parts[parts.length - 1]);
              if (pid && !isNaN(pid)) {
                return { pid, command: 'Unknown' }; // Windows netstat doesn't show command
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
              const psOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
              return { pid, command: psOutput.trim() };
            } catch {
              return { pid, command: 'Unknown' };
            }
          }
          return null;
        };
      }

      const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
      return parseOutput(output);

    } catch (error) {
      // Command failed (port not in use or lsof not available)
      return null;
    }
  }

  /**
   * Kill a process by PID
   * Works cross-platform (Linux, macOS, Windows)
   * @param {number} pid - Process ID to kill
   * @returns {Promise<boolean>} - True if successfully killed, false otherwise
   */
  async killProcess(pid) {
    try {
      if (process.platform === 'win32') {
        // Windows: taskkill /F /PID <pid>
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
      } else {
        // Linux/macOS: kill -9 <pid>
        execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
      }
      return true;
    } catch (error) {
      // Failed to kill (permission denied, process not found, etc.)
      return false;
    }
  }

  /**
   * Build and serve the documentation
   * Returns the server URL
   */
  async buildAndServe() {
    if (!this.hasDocumentation()) {
      throw new Error('Documentation not found. Run /init first to create documentation structure.');
    }

    const port = this.getPort();

    try {
      // Build the documentation asynchronously to avoid blocking
      await execAsync('npx vitepress build', {
        cwd: this.docsDir
      });

      // Start the preview server
      const serverProcess = spawn('npx', ['vitepress', 'preview', '--port', String(port)], {
        cwd: this.docsDir,
        stdio: 'pipe'
      });

      // Wait for server to be ready
      return new Promise((resolve, reject) => {
        let serverReady = false;

        serverProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log(output);

          // Check if server is ready
          if (output.includes(`http://localhost:${port}`) || output.includes(`localhost:${port}`)) {
            if (!serverReady) {
              serverReady = true;
              resolve({
                url: `http://localhost:${port}`,
                process: serverProcess
              });
            }
          }
        });

        serverProcess.stderr.on('data', (data) => {
          console.error(data.toString());
        });

        serverProcess.on('error', (error) => {
          reject(error);
        });

        serverProcess.on('exit', (code) => {
          if (code !== 0 && !serverReady) {
            reject(new Error(`Server exited with code ${code}`));
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!serverReady) {
            serverProcess.kill();
            reject(new Error('Server start timeout'));
          }
        }, 10000);
      });

    } catch (error) {
      throw new Error(`Failed to build documentation: ${error.message}`);
    }
  }

  /**
   * Build documentation without starting server
   */
  async build() {
    if (!this.hasDocumentation()) {
      throw new Error('Documentation not found. Run /init first to create documentation structure.');
    }

    try {
      // Build asynchronously to avoid blocking the event loop
      await execAsync('npx vitepress build', {
        cwd: this.docsDir
      });

    } catch (error) {
      throw new Error(`Failed to build documentation: ${error.message}`);
    }
  }
}
