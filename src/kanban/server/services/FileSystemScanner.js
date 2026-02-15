import fs from 'fs/promises';
import path from 'path';

/**
 * FileSystemScanner
 * Recursively scans .avc/project/ directory to find all work.json files
 */
export class FileSystemScanner {
  /**
   * @param {string} projectRoot - Absolute path to project root directory
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.avcProjectPath = path.join(projectRoot, '.avc', 'project');
  }

  /**
   * Scan the .avc/project/ directory and return all work.json file paths
   * @returns {Promise<Array<string>>} Array of absolute paths to work.json files
   */
  async scan() {
    try {
      // Check if .avc/project exists
      await fs.access(this.avcProjectPath);

      const workFiles = [];
      await this._scanDirectory(this.avcProjectPath, workFiles);

      return workFiles;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // .avc/project doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Recursively scan a directory for work.json files
   * @private
   * @param {string} dirPath - Directory to scan
   * @param {Array<string>} results - Accumulator for results
   */
  async _scanDirectory(dirPath, results) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this._scanDirectory(fullPath, results);
        } else if (entry.isFile() && entry.name === 'work.json') {
          // Found a work.json file
          results.push(fullPath);
        }
      }
    } catch (error) {
      // Log error but continue scanning
      console.error(`Error scanning directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Get the relative path from .avc/project/ to a work.json file
   * Useful for extracting the work item ID from the path
   * @param {string} fullPath - Absolute path to work.json
   * @returns {string} Relative path from .avc/project/
   */
  getRelativePath(fullPath) {
    return path.relative(this.avcProjectPath, fullPath);
  }

  /**
   * Extract work item ID from file path
   * Example: .avc/project/context-0001/context-0001-0001/work.json → context-0001-0001
   * @param {string} fullPath - Absolute path to work.json
   * @returns {string|null} Work item ID or null if invalid path
   */
  extractIdFromPath(fullPath) {
    const relativePath = this.getRelativePath(fullPath);
    const dir = path.dirname(relativePath);

    // Handle root-level work.json (shouldn't exist in normal hierarchy)
    if (dir === '.') {
      return null;
    }

    // Extract the deepest folder name (the work item ID)
    // Example: context-0001/context-0001-0001 → context-0001-0001
    return path.basename(dir);
  }
}
