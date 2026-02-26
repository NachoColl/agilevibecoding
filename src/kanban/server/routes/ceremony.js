import express from 'express';

/**
 * Ceremony Router
 * Handles all /api/ceremony/* endpoints for the sponsor-call wizard.
 * @param {CeremonyService} ceremonyService
 */
export function createCeremonyRouter(ceremonyService) {
  const router = express.Router();

  // GET /api/ceremony/status — current ceremony state
  router.get('/status', (req, res) => {
    res.json(ceremonyService.getStatus());
  });

  // GET /api/ceremony/models — available LLM models with API key status
  router.get('/models', async (req, res) => {
    try {
      const models = await ceremonyService.getAvailableModels();
      res.json(models);
    } catch (err) {
      console.error('getAvailableModels error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/generate-mission
  // Body: { description, modelId, provider, validatorModelId, validatorProvider }
  router.post('/generate-mission', async (req, res) => {
    const { description, modelId, provider, validatorModelId, validatorProvider } = req.body;
    console.log('[ceremony] POST /generate-mission', {
      descriptionLength: description?.length,
      modelId,
      provider,
      validatorModelId,
      validatorProvider,
    });

    if (!description?.trim() || !modelId || !provider || !validatorModelId || !validatorProvider) {
      console.warn('[ceremony] generate-mission: missing required fields');
      return res.status(400).json({
        error: 'description, modelId, provider, validatorModelId and validatorProvider are required',
      });
    }

    const start = Date.now();
    try {
      const result = await ceremonyService.generateMissionScope(
        description, modelId, provider, validatorModelId, validatorProvider
      );
      console.log(`[ceremony] generate-mission completed in ${Date.now() - start}ms`, {
        validationScore: result.validationScore,
        iterations: result.iterations,
        issueCount: result.issues?.length,
      });
      res.json(result);
    } catch (err) {
      console.error(`[ceremony] generate-mission failed in ${Date.now() - start}ms:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/refine-mission
  // Body: { missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId, validatorProvider }
  router.post('/refine-mission', async (req, res) => {
    const { missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId, validatorProvider } = req.body;
    if (!missionStatement?.trim() || !initialScope?.trim() || !refinementRequest?.trim() || !modelId || !provider || !validatorModelId || !validatorProvider) {
      return res.status(400).json({ error: 'missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId and validatorProvider are required' });
    }
    const start = Date.now();
    try {
      const result = await ceremonyService.refineMissionScope(
        missionStatement, initialScope, refinementRequest, modelId, provider, validatorModelId, validatorProvider
      );
      console.log(`[ceremony] refine-mission completed in ${Date.now() - start}ms`, { validationScore: result.validationScore, iterations: result.iterations });
      res.json(result);
    } catch (err) {
      console.error('[ceremony] refine-mission failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/analyze/database
  // Body: { mission, scope, strategy }
  router.post('/analyze/database', async (req, res) => {
    const { mission, scope, strategy } = req.body;
    console.log('[ceremony] POST /analyze/database', {
      missionLength: mission?.length,
      scopeLines: scope?.split('\n').length,
      strategy,
    });
    if (!mission || !scope) {
      return res.status(400).json({ error: 'mission and scope are required' });
    }
    const start = Date.now();
    try {
      const result = await ceremonyService.analyzeDatabase(mission, scope, strategy || null);
      console.log(`[ceremony] analyze/database completed in ${Date.now() - start}ms`);
      res.json(result);
    } catch (err) {
      console.error(`[ceremony] analyze/database failed in ${Date.now() - start}ms:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/analyze/architecture
  // Body: { mission, scope, dbContext, strategy }
  router.post('/analyze/architecture', async (req, res) => {
    const { mission, scope, dbContext, strategy } = req.body;
    console.log('[ceremony] POST /analyze/architecture', {
      missionLength: mission?.length,
      dbContext: dbContext ? 'provided' : 'null',
      strategy,
    });
    if (!mission || !scope) {
      return res.status(400).json({ error: 'mission and scope are required' });
    }
    const start = Date.now();
    try {
      const result = await ceremonyService.analyzeArchitecture(
        mission,
        scope,
        dbContext || null,
        strategy || null
      );
      console.log(`[ceremony] analyze/architecture completed in ${Date.now() - start}ms`);
      res.json(result);
    } catch (err) {
      console.error(`[ceremony] analyze/architecture failed in ${Date.now() - start}ms:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/analyze/prefill
  // Body: { mission, scope, arch, dbContext, strategy }
  router.post('/analyze/prefill', async (req, res) => {
    const { mission, scope, arch, dbContext, strategy } = req.body;
    console.log('[ceremony] POST /analyze/prefill', {
      missionLength: mission?.length,
      arch: arch ? 'provided' : 'null',
      strategy,
    });
    if (!mission || !scope || !arch) {
      return res.status(400).json({ error: 'mission, scope, and arch are required' });
    }
    const start = Date.now();
    try {
      const result = await ceremonyService.prefillAnswers(
        mission,
        scope,
        arch,
        dbContext || null,
        strategy || null
      );
      console.log(`[ceremony] analyze/prefill completed in ${Date.now() - start}ms`);
      res.json(result);
    } catch (err) {
      console.error(`[ceremony] analyze/prefill failed in ${Date.now() - start}ms:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/run
  // Body: { requirements } — all 7 template variables
  router.post('/run', async (req, res) => {
    const { requirements } = req.body;
    console.log('[ceremony] POST /run', {
      requirementKeys: Object.keys(requirements || {}),
      missionLength: requirements?.MISSION_STATEMENT?.length,
    });
    if (!requirements || !requirements.MISSION_STATEMENT) {
      return res.status(400).json({ error: 'requirements.MISSION_STATEMENT is required' });
    }
    try {
      await ceremonyService.run(requirements);
      console.log('[ceremony] run started (fire-and-forget)');
      res.json({ started: true });
    } catch (err) {
      console.error('[ceremony] run error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ceremony/sprint-planning/run
  router.post('/sprint-planning/run', async (req, res) => {
    try {
      await ceremonyService.runSprintPlanning();
      console.log('[ceremony] sprint-planning/run started (fire-and-forget)');
      res.json({ started: true });
    } catch (err) {
      console.error('[ceremony] sprint-planning/run error:', err.message);
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
