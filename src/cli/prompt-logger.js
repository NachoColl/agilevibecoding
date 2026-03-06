import fs from 'fs';
import path from 'path';

export class PromptLogger {
  /**
   * @param {string} projectRoot  - absolute path to .avc parent
   * @param {string} ceremony     - e.g. 'sprint-planning', 'sponsor-call'
   */
  constructor(projectRoot, ceremony) {
    this.ceremony = ceremony;
    this.callCount = 0;
    this.runDir = null;

    const avcDir = path.join(projectRoot, '.avc');
    if (!fs.existsSync(avcDir)) return; // not an AVC project — silently skip

    const runTs = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    this.runDir = path.join(avcDir, 'logs', 'prompts', `${ceremony}-${runTs}`);
    fs.mkdirSync(this.runDir, { recursive: true });

    this._pruneOldRuns(path.join(avcDir, 'logs', 'prompts'), ceremony, 5);
  }

  /**
   * Write one call record. Called by _trackTokens in LLMProvider.
   * @param {object} payload
   */
  write(payload) {
    if (!this.runDir) return;
    this.callCount += 1;
    const seq = String(this.callCount).padStart(3, '0');
    const stage = (payload.stage || 'unknown').replace(/\s+/g, '-');
    const timeStr = new Date().toISOString().substring(11, 19).replace(/:/g, '-');
    const filename = `${seq}-${stage}-${timeStr}.json`;
    try {
      fs.writeFileSync(
        path.join(this.runDir, filename),
        JSON.stringify(payload, null, 2),
        'utf8'
      );
    } catch { /* non-fatal */ }
  }

  _pruneOldRuns(promptsDir, ceremony, keep) {
    if (!fs.existsSync(promptsDir)) return;
    const dirs = fs.readdirSync(promptsDir)
      .filter(d => d.startsWith(`${ceremony}-`))
      .map(d => ({ name: d, full: path.join(promptsDir, d) }))
      .sort((a, b) => a.name.localeCompare(b.name)); // oldest first
    while (dirs.length >= keep) {
      const oldest = dirs.shift();
      try {
        fs.rmSync(oldest.full, { recursive: true, force: true });
      } catch { /* non-fatal */ }
    }
  }
}
