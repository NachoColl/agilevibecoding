import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';

const WORK_ITEMS_START = '// @@AVC-WORK-ITEMS-START@@';
const WORK_ITEMS_END = '// @@AVC-WORK-ITEMS-END@@';

/**
 * Syncs .avc/project/ work-item hierarchy (epics + stories + doc.md files)
 * into the VitePress documentation site at .avc/documentation/.
 *
 * Responsibilities:
 *  1. Read .avc/project/ hierarchy via work.json files
 *  2. Copy changed doc.md files into documentation/project/{epic}/{story}/index.md
 *  3. Regenerate the VitePress sidebar between marker comments in config.mts
 */
export class DocsSyncProcessor {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.avcDir = path.join(projectRoot, '.avc');
    this.projectPath = path.join(this.avcDir, 'project');
    this.docsDir = path.join(this.avcDir, 'documentation');
    this.projectDocsDir = path.join(this.docsDir, 'project');
    this.configPath = path.join(this.docsDir, '.vitepress', 'config.mts');
    this.avcConfigPath = path.join(this.avcDir, 'avc.json');
  }

  /**
   * Read the epic/story hierarchy from .avc/project/ work.json files.
   * Returns array sorted by ID, each entry: { id, name, docPath, stories: [{ id, name, docPath }] }
   */
  readHierarchy() {
    if (!fs.existsSync(this.projectPath)) {
      return [];
    }

    const entries = fs.readdirSync(this.projectPath, { withFileTypes: true });
    const epics = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const epicId = entry.name;
      const workJsonPath = path.join(this.projectPath, epicId, 'work.json');

      if (!fs.existsSync(workJsonPath)) continue;

      let workJson;
      try {
        workJson = JSON.parse(fs.readFileSync(workJsonPath, 'utf8'));
      } catch {
        continue;
      }

      if (workJson.type !== 'epic') continue;

      const epicDocPath = path.join(this.projectPath, epicId, 'doc.md');
      const stories = [];

      // Scan subdirectories for stories
      const epicDir = path.join(this.projectPath, epicId);
      const storyEntries = fs.readdirSync(epicDir, { withFileTypes: true });

      for (const storyEntry of storyEntries) {
        if (!storyEntry.isDirectory()) continue;

        const storyId = storyEntry.name;
        const storyWorkJsonPath = path.join(epicDir, storyId, 'work.json');

        if (!fs.existsSync(storyWorkJsonPath)) continue;

        let storyWorkJson;
        try {
          storyWorkJson = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
        } catch {
          continue;
        }

        if (storyWorkJson.type !== 'story') continue;

        const storyDocPath = path.join(epicDir, storyId, 'doc.md');
        stories.push({
          id: storyId,
          name: storyWorkJson.name || storyId,
          docPath: storyDocPath,
        });
      }

      stories.sort((a, b) => a.id.localeCompare(b.id));

      epics.push({
        id: epicId,
        name: workJson.name || epicId,
        docPath: epicDocPath,
        stories,
      });
    }

    epics.sort((a, b) => a.id.localeCompare(b.id));
    return epics;
  }

  /**
   * Copy src to dest if source is newer than dest (mtime-based incremental skip).
   * Returns 'copied' or 'skipped'.
   */
  syncFile(src, dest) {
    if (!fs.existsSync(src)) {
      return 'skipped';
    }

    if (fs.existsSync(dest)) {
      const srcStat = fs.statSync(src);
      const destStat = fs.statSync(dest);
      if (destStat.mtimeMs >= srcStat.mtimeMs) {
        return 'skipped';
      }
    }

    fs.copyFileSync(src, dest);
    return 'copied';
  }

  /**
   * Write a stub index.md for an epic/story that has no doc.md yet.
   */
  _writeStub(destPath, name) {
    const content = `# ${name}\n\n_Documentation pending._\n`;
    fs.writeFileSync(destPath, content, 'utf8');
  }

  /**
   * Main sync orchestration. Reads hierarchy, copies files, regenerates sidebar config.
   * @param {Function} [progressCallback] - optional (message) => void
   * @returns {{ epics: number, stories: number, copied: number, skipped: number }}
   */
  async sync(progressCallback = null) {
    if (!fs.existsSync(this.docsDir)) {
      throw new Error('Documentation directory not found. Run /init first to create documentation structure.');
    }

    const report = (msg) => { if (progressCallback) progressCallback(msg); };
    const hierarchy = this.readHierarchy();

    let epicCount = 0;
    let storyCount = 0;
    let copiedCount = 0;
    let skippedCount = 0;

    // Sync project root doc.md → documentation/index.md
    const projectDocSrc = path.join(this.projectPath, 'doc.md');
    const projectDocDest = path.join(this.docsDir, 'index.md');
    if (fs.existsSync(projectDocSrc)) {
      const result = this.syncFile(projectDocSrc, projectDocDest);
      if (result === 'copied') copiedCount++;
      else skippedCount++;
      report(`Project brief: ${result}`);
    }

    // Ensure project/ subdir exists if we have epics
    if (hierarchy.length > 0) {
      fs.mkdirSync(this.projectDocsDir, { recursive: true });
    }

    for (const epic of hierarchy) {
      epicCount++;
      const epicDestDir = path.join(this.projectDocsDir, epic.id);
      fs.mkdirSync(epicDestDir, { recursive: true });

      const epicDestPath = path.join(epicDestDir, 'index.md');
      if (fs.existsSync(epic.docPath)) {
        const result = this.syncFile(epic.docPath, epicDestPath);
        if (result === 'copied') copiedCount++;
        else skippedCount++;
        report(`Epic ${epic.id}: ${result}`);
      } else {
        this._writeStub(epicDestPath, epic.name);
        copiedCount++;
        report(`Epic ${epic.id}: stub written`);
      }

      for (const story of epic.stories) {
        storyCount++;
        const storyDestDir = path.join(epicDestDir, story.id);
        fs.mkdirSync(storyDestDir, { recursive: true });

        const storyDestPath = path.join(storyDestDir, 'index.md');
        if (fs.existsSync(story.docPath)) {
          const result = this.syncFile(story.docPath, storyDestPath);
          if (result === 'copied') copiedCount++;
          else skippedCount++;
          report(`Story ${story.id}: ${result}`);
        } else {
          this._writeStub(storyDestPath, story.name);
          copiedCount++;
          report(`Story ${story.id}: stub written`);
        }
      }
    }

    // Regenerate VitePress sidebar config
    this.generateVitePressConfig(hierarchy);

    return { epics: epicCount, stories: storyCount, copied: copiedCount, skipped: skippedCount };
  }

  /**
   * Regenerate the @@AVC-WORK-ITEMS-START@@ … @@AVC-WORK-ITEMS-END@@ block in config.mts.
   * If markers are absent (existing project), appends as second sidebar array element and inserts markers.
   */
  generateVitePressConfig(hierarchy) {
    if (!fs.existsSync(this.configPath)) return;

    const content = fs.readFileSync(this.configPath, 'utf8');
    const workItemsBlock = this._buildWorkItemsBlock(hierarchy);

    if (content.includes(WORK_ITEMS_START)) {
      // Replace content between markers (inclusive)
      const startIdx = content.indexOf(WORK_ITEMS_START);
      const endIdx = content.indexOf(WORK_ITEMS_END);
      if (endIdx === -1) return; // malformed markers, skip

      const before = content.slice(0, startIdx);
      const after = content.slice(endIdx + WORK_ITEMS_END.length);
      const updated = before + workItemsBlock + after;
      fs.writeFileSync(this.configPath, updated, 'utf8');
    } else {
      // Backwards compat: insert markers + work items block before the closing of the sidebar array
      // Find the closing `]` of the sidebar array
      const sidebarMatch = content.match(/sidebar:\s*\[/);
      if (!sidebarMatch) return;

      // Find the end of the first sidebar item block to insert after it
      const insertionPattern = /sidebar:\s*\[\s*\{[\s\S]*?\}\s*(?=\])/;
      const match = insertionPattern.exec(content);
      if (!match) return;

      const insertAt = match.index + match[0].length;
      const updated = content.slice(0, insertAt) + '\n      ' + workItemsBlock + '\n    ' + content.slice(insertAt);
      fs.writeFileSync(this.configPath, updated, 'utf8');
    }
  }

  /**
   * Build the sidebar work-items block string (with markers).
   */
  _buildWorkItemsBlock(hierarchy) {
    if (hierarchy.length === 0) {
      return `${WORK_ITEMS_START}\n      ${WORK_ITEMS_END}`;
    }

    const epicItems = hierarchy.map(epic => {
      const storyItems = epic.stories.map(story => {
        const link = path.posix.join('/project', epic.id, story.id) + '/';
        return `          { text: ${JSON.stringify(story.name)}, link: ${JSON.stringify(link)} }`;
      });

      const epicLink = path.posix.join('/project', epic.id) + '/';
      if (storyItems.length > 0) {
        return `        { text: ${JSON.stringify(epic.name)}, link: ${JSON.stringify(epicLink)}, collapsed: false, items: [\n${storyItems.join(',\n')}\n        ] }`;
      } else {
        return `        { text: ${JSON.stringify(epic.name)}, link: ${JSON.stringify(epicLink)} }`;
      }
    });

    const block = `,{
        text: 'Work Items',
        items: [
${epicItems.join(',\n')}
        ]
      }`;

    return `${WORK_ITEMS_START}\n      ${block}\n      ${WORK_ITEMS_END}`;
  }

  /**
   * Watch .avc/project/ for md changes and trigger sync with debounce.
   * Returns a chokidar watcher instance.
   */
  watch(onChange = null) {
    let debounceTimer = null;

    const watcher = chokidar.watch(path.join(this.projectPath, '**', '*.md'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    const trigger = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const stats = await this.sync();
          if (onChange) onChange(stats);
        } catch {
          // Ignore errors in watch mode
        }
      }, 500);
    };

    watcher.on('add', trigger);
    watcher.on('change', trigger);
    watcher.on('unlink', trigger);

    return watcher;
  }
}
