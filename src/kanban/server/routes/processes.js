import express from 'express';

/**
 * Processes Router
 * REST endpoints for monitoring and controlling forked ceremony/CLI processes.
 * @param {ProcessRegistry} registry
 */
export function createProcessesRouter(registry) {
  const router = express.Router();

  // GET /api/processes — list all process DTOs (no logs)
  router.get('/', (req, res) => {
    res.json(registry.list());
  });

  // GET /api/processes/:id — single process DTO
  router.get('/:id', (req, res) => {
    const dto = registry.getDTO(req.params.id);
    if (!dto) return res.status(404).json({ error: 'Process not found' });
    res.json(dto);
  });

  // DELETE /api/processes — clear all completed/error/cancelled records
  router.delete('/', (req, res) => {
    registry.clearCompleted();
    res.json({ ok: true });
  });

  // DELETE /api/processes/:id — kill running process or clear finished record
  router.delete('/:id', (req, res) => {
    const record = registry.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Process not found' });
    registry.kill(req.params.id);
    res.json({ ok: true });
  });

  // POST /api/processes/:id/pause
  router.post('/:id/pause', (req, res) => {
    const ok = registry.pause(req.params.id);
    res.json({ ok });
  });

  // POST /api/processes/:id/resume
  router.post('/:id/resume', (req, res) => {
    const ok = registry.resume(req.params.id);
    res.json({ ok });
  });

  return router;
}
