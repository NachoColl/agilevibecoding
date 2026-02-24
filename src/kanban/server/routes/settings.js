import express from 'express';
import fs from 'fs/promises';
import path from 'path';

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

  // PUT /api/settings/ceremonies
  router.put('/ceremonies', async (req, res) => {
    try {
      const { ceremonies } = req.body;
      if (!Array.isArray(ceremonies)) {
        return res.status(400).json({ error: 'ceremonies must be an array' });
      }
      const config = await readAvcConfig();
      if (!config.settings) config.settings = {};
      config.settings.ceremonies = ceremonies;
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

  return router;
}
