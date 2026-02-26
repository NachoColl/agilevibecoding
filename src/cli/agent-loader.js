import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AGENTS_PATH = path.join(__dirname, 'agents');

/**
 * Load agent content, checking for a project-specific override first.
 * @param {string} agentName - Agent filename (e.g. 'mission-generator.md')
 * @param {string} [projectRoot] - Absolute project root; if omitted, uses process.cwd()
 * @returns {string} Agent content
 */
export function loadAgent(agentName, projectRoot) {
  const root = projectRoot ?? process.cwd();
  const overridePath = path.join(root, '.avc', 'customized-agents', agentName);
  if (existsSync(overridePath)) {
    return readFileSync(overridePath, 'utf8');
  }
  return readFileSync(path.join(DEFAULT_AGENTS_PATH, agentName), 'utf8');
}
