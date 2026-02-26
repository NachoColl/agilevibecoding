import express from 'express';
import fs from 'fs/promises';
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __routeDir = path.dirname(fileURLToPath(import.meta.url));
const LIB_AGENTS_PATH = path.join(__routeDir, '../../../cli/agents');
const customAgentsDir = (root) => path.join(root, '.avc', 'customized-agents');

/**
 * Default model catalogue — mirrors the defaults in src/cli/init.js.
 * Used as a fallback when a project's avc.json pre-dates model pricing support.
 */
const PRICING_SOURCES = {
  claude: 'https://www.anthropic.com/pricing',
  gemini: 'https://ai.google.dev/pricing',
  openai: 'https://openai.com/api/pricing',
};

const DEFAULT_MODELS = {
  // Anthropic Claude models (prices per 1M tokens in USD)
  'claude-opus-4-6':            { provider: 'claude',  displayName: 'Claude Opus 4.6',          pricing: { input: 5.00,  output: 25.00, unit: 'million', source: PRICING_SOURCES.claude, lastUpdated: '2026-02-24' } },
  'claude-sonnet-4-6':          { provider: 'claude',  displayName: 'Claude Sonnet 4.6',        pricing: { input: 3.00,  output: 15.00, unit: 'million', source: PRICING_SOURCES.claude, lastUpdated: '2026-02-24' } },
  'claude-haiku-4-5-20251001':  { provider: 'claude',  displayName: 'Claude Haiku 4.5',         pricing: { input: 1.00,  output:  5.00, unit: 'million', source: PRICING_SOURCES.claude, lastUpdated: '2026-02-24' } },
  // Google Gemini models (prices per 1M tokens in USD)
  'gemini-2.5-pro':             { provider: 'gemini',  displayName: 'Gemini 2.5 Pro',           pricing: { input: 1.25,  output: 10.00, unit: 'million', source: PRICING_SOURCES.gemini, lastUpdated: '2026-02-24' } },
  'gemini-2.5-flash':           { provider: 'gemini',  displayName: 'Gemini 2.5 Flash',         pricing: { input: 0.30,  output:  2.50, unit: 'million', source: PRICING_SOURCES.gemini, lastUpdated: '2026-02-24' } },
  'gemini-2.5-flash-lite':      { provider: 'gemini',  displayName: 'Gemini 2.5 Flash-Lite',    pricing: { input: 0.10,  output:  0.40, unit: 'million', source: PRICING_SOURCES.gemini, lastUpdated: '2026-02-24' } },
  // OpenAI models (prices per 1M tokens in USD)
  'gpt-5.2':                    { provider: 'openai',  displayName: 'GPT-5.2',                  pricing: { input: 1.75,  output: 14.00, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
  'gpt-5.1':                    { provider: 'openai',  displayName: 'GPT-5.1',                  pricing: { input: 1.25,  output: 10.00, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
  'gpt-5-mini':                 { provider: 'openai',  displayName: 'GPT-5 mini',               pricing: { input: 0.25,  output:  2.00, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
  'o4-mini':                    { provider: 'openai',  displayName: 'o4-mini',                  pricing: { input: 1.10,  output:  4.40, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
  'o3':                         { provider: 'openai',  displayName: 'o3',                       pricing: { input: 2.00,  output:  8.00, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
  'o3-mini':                    { provider: 'openai',  displayName: 'o3-mini',                  pricing: { input: 0.50,  output:  2.00, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
  'gpt-5.2-codex':              { provider: 'openai',  displayName: 'GPT-5.2-Codex',            pricing: { input: 1.75,  output: 14.00, unit: 'million', source: PRICING_SOURCES.openai, lastUpdated: '2026-02-24' } },
};

/**
 * Settings Router
 * Handles GET /api/settings and PUT sub-routes for project configuration.
 * @param {string} projectRoot - Absolute path to project root
 */
export function createSettingsRouter(projectRoot) {
  const router = express.Router();
  const avcJsonPath = path.join(projectRoot, '.avc', 'avc.json');
  const envPath = path.join(projectRoot, '.env');

  const readAvcConfig = async () => {
    try {
      return JSON.parse(await fs.readFile(avcJsonPath, 'utf8'));
    } catch {
      return {};
    }
  };

  const writeAvcConfig = async (config) => {
    await fs.writeFile(avcJsonPath, JSON.stringify(config, null, 2), 'utf8');
  };

  // Parse .env into key→value map
  const readEnv = async () => {
    try {
      const lines = (await fs.readFile(envPath, 'utf8')).split('\n');
      const map = {};
      for (const line of lines) {
        const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
        if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      return map;
    } catch {
      return {};
    }
  };

  // Update or insert a single key in .env, preserving all other lines
  const upsertEnvKey = async (key, value) => {
    let content = '';
    try { content = await fs.readFile(envPath, 'utf8'); } catch {}
    const lines = content.split('\n');
    const idx = lines.findIndex(l => l.match(new RegExp(`^${key}\\s*=`)));
    const newLine = value ? `${key}=${value}` : '';
    if (idx >= 0) {
      if (newLine) {
        lines[idx] = newLine;
      } else {
        lines.splice(idx, 1);
      }
    } else if (newLine) {
      lines.push(newLine);
    }
    await fs.writeFile(envPath, lines.join('\n'), 'utf8');
  };

  // GET /api/settings — snapshot of all configurable settings
  router.get('/', async (req, res) => {
    try {
      const [config, env] = await Promise.all([readAvcConfig(), readEnv()]);
      res.json({
        apiKeys: {
          anthropic: {
            isSet: !!env.ANTHROPIC_API_KEY,
            preview: env.ANTHROPIC_API_KEY ? env.ANTHROPIC_API_KEY.slice(0, 10) + '…' : '',
          },
          gemini: {
            isSet: !!env.GEMINI_API_KEY,
            preview: env.GEMINI_API_KEY ? env.GEMINI_API_KEY.slice(0, 10) + '…' : '',
          },
          openai: {
            isSet: !!env.OPENAI_API_KEY,
            preview: env.OPENAI_API_KEY ? env.OPENAI_API_KEY.slice(0, 10) + '…' : '',
          },
        },
        ceremonies: config?.settings?.ceremonies || [],
        models: (config?.settings?.models && Object.keys(config.settings.models).length > 0)
          ? config.settings.models
          : DEFAULT_MODELS,
        missionGenerator: config?.settings?.missionGenerator || { validation: { maxIterations: 3, acceptanceThreshold: 75 } },
        kanbanPort: config?.settings?.kanban?.port || 4174,
        docsPort: config?.settings?.documentation?.port || 4173,
        boardTitle: config?.settings?.kanban?.title || 'AVC Kanban Board',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/settings/api-keys — only sends keys that are being updated
  router.put('/api-keys', async (req, res) => {
    try {
      const { anthropic, gemini, openai } = req.body;
      if (anthropic !== undefined) await upsertEnvKey('ANTHROPIC_API_KEY', anthropic);
      if (gemini !== undefined) await upsertEnvKey('GEMINI_API_KEY', gemini);
      if (openai !== undefined) await upsertEnvKey('OPENAI_API_KEY', openai);
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/settings/ceremonies — also accepts missionGenerator alongside ceremonies
  router.put('/ceremonies', async (req, res) => {
    try {
      const { ceremonies, missionGenerator } = req.body;
      if (!Array.isArray(ceremonies)) {
        return res.status(400).json({ error: 'ceremonies must be an array' });
      }
      const config = await readAvcConfig();
      if (!config.settings) config.settings = {};
      config.settings.ceremonies = ceremonies;
      // Persist missionGenerator validation params if provided
      if (missionGenerator?.validation && typeof missionGenerator.validation === 'object') {
        if (!config.settings.missionGenerator) config.settings.missionGenerator = {};
        config.settings.missionGenerator.validation = {
          maxIterations: Number(missionGenerator.validation.maxIterations) || 3,
          acceptanceThreshold: Number(missionGenerator.validation.acceptanceThreshold) || 75,
        };
      }
      await writeAvcConfig(config);
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/settings/models — update pricing for all models
  router.put('/models', async (req, res) => {
    try {
      const { models } = req.body;
      if (!models || typeof models !== 'object' || Array.isArray(models)) {
        return res.status(400).json({ error: 'models must be an object' });
      }
      const config = await readAvcConfig();
      if (!config.settings) config.settings = {};
      // Seed from defaults if models have never been persisted (migration for old projects)
      if (!config.settings.models || Object.keys(config.settings.models).length === 0) {
        config.settings.models = JSON.parse(JSON.stringify(DEFAULT_MODELS));
      }
      for (const [modelId, data] of Object.entries(models)) {
        if (!config.settings.models[modelId]) continue; // only update existing models
        if (data.pricing && typeof data.pricing === 'object') {
          const today = new Date().toISOString().split('T')[0];
          config.settings.models[modelId].pricing = {
            input: Number(data.pricing.input) || 0,
            output: Number(data.pricing.output) || 0,
            unit: data.pricing.unit === 'thousand' ? 'thousand' : 'million',
            source: typeof data.pricing.source === 'string' ? data.pricing.source.trim() : '',
            lastUpdated: today,
          };
        }
      }
      await writeAvcConfig(config);
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/settings/general — board title and/or ports
  router.put('/general', async (req, res) => {
    try {
      const { boardTitle, kanbanPort, docsPort } = req.body;
      const config = await readAvcConfig();
      if (!config.settings) config.settings = {};
      if (!config.settings.kanban) config.settings.kanban = {};
      if (!config.settings.documentation) config.settings.documentation = {};
      if (boardTitle !== undefined) config.settings.kanban.title = boardTitle.trim();
      if (kanbanPort !== undefined) config.settings.kanban.port = Number(kanbanPort);
      if (docsPort !== undefined) config.settings.documentation.port = Number(docsPort);
      await writeAvcConfig(config);
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/settings/agents — list all agent names with customization status
  router.get('/agents', (req, res) => {
    try {
      const names = readdirSync(LIB_AGENTS_PATH).filter(f => f.endsWith('.md')).sort();
      const customDir = customAgentsDir(projectRoot);
      const agents = names.map(name => ({
        name,
        isCustomized: existsSync(path.join(customDir, name)),
      }));
      res.json({ agents });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/settings/agents/:name — get agent content (customized or default)
  router.get('/agents/:name', (req, res) => {
    const { name } = req.params;
    if (!name.endsWith('.md') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    try {
      const customPath = path.join(customAgentsDir(projectRoot), name);
      const libPath = path.join(LIB_AGENTS_PATH, name);
      if (!existsSync(libPath)) return res.status(404).json({ error: 'Agent not found' });
      const isCustomized = existsSync(customPath);
      const content = readFileSync(isCustomized ? customPath : libPath, 'utf8');
      const defaultContent = readFileSync(libPath, 'utf8');
      res.json({ name, content, isCustomized, defaultContent });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/settings/agents/:name — save customized agent
  router.put('/agents/:name', async (req, res) => {
    const { name } = req.params;
    const { content } = req.body;
    if (!name.endsWith('.md') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    try {
      const dir = customAgentsDir(projectRoot);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), content, 'utf8');
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/settings/agents/:name — reset to library default
  router.delete('/agents/:name', async (req, res) => {
    const { name } = req.params;
    if (!name.endsWith('.md') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    try {
      const customPath = path.join(customAgentsDir(projectRoot), name);
      try { await fs.unlink(customPath); } catch {}
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
