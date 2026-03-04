import fs from 'fs/promises';
import path from 'path';
import { extractDescriptionFromDoc } from '../utils/markdown.js';

/**
 * WorkItemReader
 * Parses work.json files and builds hierarchical work item structure
 */
export class WorkItemReader {
  /**
   * @param {string} projectRoot - Absolute path to project root directory
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.avcProjectPath = path.join(projectRoot, '.avc', 'project');
  }

  /**
   * Read and parse a single work.json file
   * @param {string} filePath - Absolute path to work.json
   * @returns {Promise<object|null>} Parsed work item or null if invalid
   */
  async readWorkItem(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const workItem = JSON.parse(content);

      // Enhance with computed fields
      workItem._filePath = filePath;
      workItem._dirPath = path.dirname(filePath);

      return workItem;
    } catch (error) {
      console.error(`Error reading work item from ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Read all work items from an array of file paths
   * @param {Array<string>} filePaths - Array of absolute paths to work.json files
   * @returns {Promise<Array<object>>} Array of parsed work items
   */
  async readAllWorkItems(filePaths) {
    const promises = filePaths.map((filePath) => this.readWorkItem(filePath));
    const results = await Promise.all(promises);

    // Filter out null results (failed reads)
    return results.filter((item) => item !== null);
  }

  /**
   * Determine work item type based on ID depth
   * Example: context-0001 → epic, context-0001-0001 → story, etc.
   * @param {string} id - Work item ID
   * @returns {string} Type: 'epic' | 'story' | 'task' | 'subtask'
   */
  getWorkItemType(id) {
    const parts = id.split('-');
    const depth = parts.length - 1; // Subtract 1 for 'context' prefix

    switch (depth) {
      case 1:
        return 'epic';
      case 2:
        return 'story';
      case 3:
        return 'task';
      case 4:
        return 'subtask';
      default:
        return 'unknown';
    }
  }

  /**
   * Get parent ID from a work item ID
   * Example: context-0001-0001-0001 → context-0001-0001
   * @param {string} id - Work item ID
   * @returns {string|null} Parent ID or null if root level
   */
  getParentId(id) {
    const parts = id.split('-');

    if (parts.length <= 2) {
      // Root level (epic), no parent
      return null;
    }

    // Remove the last segment
    return parts.slice(0, -1).join('-');
  }

  /**
   * Read doc.md file for a work item
   * @param {string} workItemPath - Directory path of work item
   * @returns {Promise<string|null>} Markdown content or null if not found
   */
  async readDocumentation(workItemPath) {
    try {
      const docPath = path.join(workItemPath, 'doc.md');
      return await fs.readFile(docPath, 'utf8');
    } catch (error) {
      return null;
    }
  }

  /**
   * Get full details for a work item (including doc.md)
   * @param {object} workItem - Base work item object
   * @returns {Promise<object>} Enhanced work item with documentation
   */
  async getFullDetails(workItem) {
    const dirPath = workItem._dirPath;
    const doc = await this.readDocumentation(dirPath);
    return {
      ...workItem,
      // doc.md opening paragraph is canonical; fall back to work.json value if no doc.md
      description: doc ? extractDescriptionFromDoc(doc) || workItem.description : workItem.description,
      documentation: doc,
    };
  }
}
