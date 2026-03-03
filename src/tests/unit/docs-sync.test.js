import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DocsSyncProcessor } from '../../cli/docs-sync.js';

// Helper: create a temp project root with .avc structure
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-docs-sync-'));
  const avcDir = path.join(tmpDir, '.avc');
  const projectPath = path.join(avcDir, 'project');
  const docsDir = path.join(avcDir, 'documentation');
  fs.mkdirSync(projectPath, { recursive: true });
  fs.mkdirSync(path.join(docsDir, '.vitepress'), { recursive: true });
  return { tmpDir, avcDir, projectPath, docsDir };
}

// Helper: write a work.json
function writeWorkJson(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'work.json'), JSON.stringify(data), 'utf8');
}

// Helper: write a doc.md
function writeDoc(dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'doc.md'), content, 'utf8');
}

// Helper: write a minimal config.mts with markers
function writeConfig(docsDir, withMarkers = true) {
  const configDir = path.join(docsDir, '.vitepress');
  fs.mkdirSync(configDir, { recursive: true });
  const sidebar = withMarkers
    ? `    sidebar: [
      {
        items: [
          { text: 'Project Brief', link: '/' }
        ]
      }
      // @@AVC-WORK-ITEMS-START@@
      // @@AVC-WORK-ITEMS-END@@
    ],`
    : `    sidebar: [
      {
        items: [
          { text: 'Project Brief', link: '/' }
        ]
      }
    ],`;

  const content = `import { defineConfig } from 'vitepress'
export default defineConfig({
  title: 'Test',
  themeConfig: {
    nav: [{ text: 'Home', link: '/' }],
${sidebar}
  }
})
`;
  fs.writeFileSync(path.join(configDir, 'config.mts'), content, 'utf8');
}

// Recursive temp dir cleanup
function rmTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('DocsSyncProcessor', () => {
  let tmpDir, avcDir, projectPath, docsDir;
  let syncer;

  beforeEach(() => {
    ({ tmpDir, avcDir, projectPath, docsDir } = createTempProject());
    syncer = new DocsSyncProcessor(tmpDir);
  });

  afterEach(() => {
    rmTmp(tmpDir);
  });

  // ─── readHierarchy ────────────────────────────────────────────────────────

  describe('readHierarchy()', () => {
    it('returns [] when project dir is absent', () => {
      fs.rmSync(projectPath, { recursive: true });
      expect(syncer.readHierarchy()).toEqual([]);
    });

    it('returns [] when project dir exists but has no epics', () => {
      expect(syncer.readHierarchy()).toEqual([]);
    });

    it('ignores dirs without work.json', () => {
      fs.mkdirSync(path.join(projectPath, 'orphan-dir'), { recursive: true });
      expect(syncer.readHierarchy()).toEqual([]);
    });

    it('ignores dirs with non-epic work.json', () => {
      writeWorkJson(path.join(projectPath, 'story-0001'), { type: 'story', name: 'A Story' });
      expect(syncer.readHierarchy()).toEqual([]);
    });

    it('builds correct tree from work.json files', () => {
      const epicDir = path.join(projectPath, 'myproject-0001');
      writeWorkJson(epicDir, { type: 'epic', name: 'First Epic' });
      writeDoc(epicDir, '# First Epic');

      const story1Dir = path.join(epicDir, 'myproject-0001-0001');
      writeWorkJson(story1Dir, { type: 'story', name: 'Story One' });
      writeDoc(story1Dir, '# Story One');

      const story2Dir = path.join(epicDir, 'myproject-0001-0002');
      writeWorkJson(story2Dir, { type: 'story', name: 'Story Two' });

      const hierarchy = syncer.readHierarchy();
      expect(hierarchy).toHaveLength(1);
      expect(hierarchy[0].id).toBe('myproject-0001');
      expect(hierarchy[0].name).toBe('First Epic');
      expect(hierarchy[0].stories).toHaveLength(2);
      expect(hierarchy[0].stories[0].id).toBe('myproject-0001-0001');
      expect(hierarchy[0].stories[1].id).toBe('myproject-0001-0002');
    });

    it('sorts epics and stories by id', () => {
      writeWorkJson(path.join(projectPath, 'proj-0002'), { type: 'epic', name: 'B Epic' });
      writeWorkJson(path.join(projectPath, 'proj-0001'), { type: 'epic', name: 'A Epic' });

      const hierarchy = syncer.readHierarchy();
      expect(hierarchy[0].id).toBe('proj-0001');
      expect(hierarchy[1].id).toBe('proj-0002');
    });
  });

  // ─── syncFile ─────────────────────────────────────────────────────────────

  describe('syncFile()', () => {
    it('returns "skipped" when source does not exist', () => {
      const src = path.join(tmpDir, 'nonexistent.md');
      const dest = path.join(tmpDir, 'dest.md');
      expect(syncer.syncFile(src, dest)).toBe('skipped');
    });

    it('copies file when dest does not exist', () => {
      const src = path.join(tmpDir, 'src.md');
      const dest = path.join(tmpDir, 'dest.md');
      fs.writeFileSync(src, '# Hello', 'utf8');
      expect(syncer.syncFile(src, dest)).toBe('copied');
      expect(fs.readFileSync(dest, 'utf8')).toBe('# Hello');
    });

    it('copies when source is newer than dest', () => {
      const src = path.join(tmpDir, 'src.md');
      const dest = path.join(tmpDir, 'dest.md');
      fs.writeFileSync(dest, '# Old', 'utf8');
      // Set dest mtime to past
      const past = new Date(Date.now() - 5000);
      fs.utimesSync(dest, past, past);
      fs.writeFileSync(src, '# New', 'utf8');
      expect(syncer.syncFile(src, dest)).toBe('copied');
      expect(fs.readFileSync(dest, 'utf8')).toBe('# New');
    });

    it('skips when dest is newer than or equal to source', () => {
      const src = path.join(tmpDir, 'src.md');
      const dest = path.join(tmpDir, 'dest.md');
      fs.writeFileSync(src, '# Hello', 'utf8');
      fs.writeFileSync(dest, '# Hello', 'utf8');
      // Set dest mtime to future
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(dest, future, future);
      expect(syncer.syncFile(src, dest)).toBe('skipped');
    });
  });

  // ─── sync() ───────────────────────────────────────────────────────────────

  describe('sync()', () => {
    it('throws when docs dir is absent', async () => {
      fs.rmSync(docsDir, { recursive: true });
      await expect(syncer.sync()).rejects.toThrow('Documentation directory not found');
    });

    it('returns zero stats when no epics exist', async () => {
      writeConfig(docsDir);
      const stats = await syncer.sync();
      expect(stats.epics).toBe(0);
      expect(stats.stories).toBe(0);
    });

    it('creates subdirs and copies files, returns correct stats', async () => {
      writeConfig(docsDir);

      const epicDir = path.join(projectPath, 'proj-0001');
      writeWorkJson(epicDir, { type: 'epic', name: 'My Epic' });
      writeDoc(epicDir, '# My Epic');

      const storyDir = path.join(epicDir, 'proj-0001-0001');
      writeWorkJson(storyDir, { type: 'story', name: 'My Story' });
      writeDoc(storyDir, '# My Story');

      const stats = await syncer.sync();
      expect(stats.epics).toBe(1);
      expect(stats.stories).toBe(1);
      expect(stats.copied).toBeGreaterThanOrEqual(2);

      // Check files exist
      expect(fs.existsSync(path.join(docsDir, 'project', 'proj-0001', 'index.md'))).toBe(true);
      expect(fs.existsSync(path.join(docsDir, 'project', 'proj-0001', 'proj-0001-0001', 'index.md'))).toBe(true);
    });

    it('writes stub when doc.md missing for epic', async () => {
      writeConfig(docsDir);

      const epicDir = path.join(projectPath, 'proj-0001');
      writeWorkJson(epicDir, { type: 'epic', name: 'Stubbed Epic' });
      // No doc.md written

      await syncer.sync();
      const destContent = fs.readFileSync(
        path.join(docsDir, 'project', 'proj-0001', 'index.md'),
        'utf8'
      );
      expect(destContent).toContain('Stubbed Epic');
      expect(destContent).toContain('_Documentation pending._');
    });

    it('writes stub when doc.md missing for story', async () => {
      writeConfig(docsDir);

      const epicDir = path.join(projectPath, 'proj-0001');
      writeWorkJson(epicDir, { type: 'epic', name: 'Epic' });
      writeDoc(epicDir, '# Epic');

      const storyDir = path.join(epicDir, 'proj-0001-0001');
      writeWorkJson(storyDir, { type: 'story', name: 'Stubbed Story' });
      // No story doc.md

      await syncer.sync();
      const destContent = fs.readFileSync(
        path.join(docsDir, 'project', 'proj-0001', 'proj-0001-0001', 'index.md'),
        'utf8'
      );
      expect(destContent).toContain('Stubbed Story');
      expect(destContent).toContain('_Documentation pending._');
    });
  });

  // ─── generateVitePressConfig ──────────────────────────────────────────────

  describe('generateVitePressConfig()', () => {
    it('produces correct sidebar with 2 epics and 3 stories', () => {
      writeConfig(docsDir);

      const hierarchy = [
        {
          id: 'proj-0001', name: 'Epic One',
          stories: [
            { id: 'proj-0001-0001', name: 'Story A' },
            { id: 'proj-0001-0002', name: 'Story B' },
          ]
        },
        {
          id: 'proj-0002', name: 'Epic Two',
          stories: [
            { id: 'proj-0002-0001', name: 'Story C' },
          ]
        }
      ];

      syncer.generateVitePressConfig(hierarchy);
      const result = fs.readFileSync(syncer.configPath, 'utf8');

      expect(result).toContain('Work Items');
      expect(result).toContain('Epic One');
      expect(result).toContain('Epic Two');
      expect(result).toContain('Story A');
      expect(result).toContain('Story B');
      expect(result).toContain('Story C');
      expect(result).toContain('/project/proj-0001/');
      expect(result).toContain('/project/proj-0002/');
      expect(result).toContain('/project/proj-0001/proj-0001-0001/');
      expect(result).toContain('@@AVC-WORK-ITEMS-START@@');
      expect(result).toContain('@@AVC-WORK-ITEMS-END@@');
    });

    it('is idempotent (running twice produces the same output)', () => {
      writeConfig(docsDir);

      const hierarchy = [
        { id: 'proj-0001', name: 'Epic One', stories: [{ id: 'proj-0001-0001', name: 'Story A' }] }
      ];

      syncer.generateVitePressConfig(hierarchy);
      const first = fs.readFileSync(syncer.configPath, 'utf8');

      syncer.generateVitePressConfig(hierarchy);
      const second = fs.readFileSync(syncer.configPath, 'utf8');

      expect(first).toBe(second);
    });

    it('appends markers when absent (backwards compat for existing projects)', () => {
      writeConfig(docsDir, false); // no markers

      const hierarchy = [
        { id: 'proj-0001', name: 'My Epic', stories: [] }
      ];

      syncer.generateVitePressConfig(hierarchy);
      const result = fs.readFileSync(syncer.configPath, 'utf8');

      expect(result).toContain('@@AVC-WORK-ITEMS-START@@');
      expect(result).toContain('@@AVC-WORK-ITEMS-END@@');
      expect(result).toContain('Work Items');
      expect(result).toContain('My Epic');
    });

    it('preserves non-work-items content in config', () => {
      writeConfig(docsDir);

      syncer.generateVitePressConfig([]);
      const result = fs.readFileSync(syncer.configPath, 'utf8');

      expect(result).toContain("title: 'Test'");
      expect(result).toContain("{ text: 'Project Brief', link: '/' }");
    });

    it('does nothing when config.mts is absent', () => {
      // No config.mts written — should not throw
      expect(() => syncer.generateVitePressConfig([])).not.toThrow();
    });
  });
});
