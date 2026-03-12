import express from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Costs Router
 * Handles GET /api/costs/summary and /api/costs/history
 * Reads token-history.json written by TokenTracker.
 * @param {string} projectRoot - Absolute path to project root
 */
export function createCostsRouter(projectRoot) {
  const router = express.Router();
  const historyPath = path.join(projectRoot, '.avc', 'token-history.json');

  // Top-level ceremony names — each becomes a parent node in the hierarchy
  const PARENT_CEREMONIES = ['sponsor-call', 'sprint-planning', 'seed'];

  // Explicit stage → parent mapping for stages whose names don't carry a prefix
  const STAGE_PARENT_MAP = {
    'mission-scope':                   'sponsor-call',
    'mission-refine':                  'sponsor-call',
    'analyze-database':                'sponsor-call',
    'analyze-architecture':            'sponsor-call',
    'prefill-answers':                 'sponsor-call',
    'sprint-planning-decomposition':   'sprint-planning',
    'sprint-planning-validation':      'sprint-planning',
    'sprint-planning-solver':          'sprint-planning',
    'sprint-planning-doc-distribution':'sprint-planning',
    'sprint-planning-enrichment':      'sprint-planning',
  };

  function getParentCeremony(key) {
    if (STAGE_PARENT_MAP[key]) return STAGE_PARENT_MAP[key];
    for (const parent of PARENT_CEREMONIES) {
      if (key !== parent && key.startsWith(`${parent}-`)) return parent;
    }
    if (PARENT_CEREMONIES.includes(key)) return key; // self
    return null;
  }

  function readHistory() {
    if (!fs.existsSync(historyPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      return null;
    }
  }

  function getCurrentMonthKey() {
    return new Date().toISOString().substring(0, 7); // YYYY-MM
  }

  // GET /api/costs/summary — current month totals for header chip
  router.get('/summary', (req, res) => {
    const history = readHistory();
    if (!history) return res.json({ totalCost: 0, totalTokens: 0, apiCalls: 0 });

    const monthKey = getCurrentMonthKey();
    const monthly = history.totals?.monthly?.[monthKey] ?? {};

    res.json({
      totalCost: monthly.cost?.total ?? 0,
      totalTokens: (monthly.input ?? 0) + (monthly.output ?? 0),
      apiCalls: monthly.executions ?? 0,
    });
  });

  // GET /api/costs/history?days=30 (or ?from=YYYY-MM-DD&to=YYYY-MM-DD)
  router.get('/history', (req, res) => {
    const history = readHistory();
    if (!history) return res.json({ daily: [], ceremonies: [] });

    // Determine date range
    let cutoff, endDate;
    if (req.query.from && req.query.to) {
      cutoff = new Date(req.query.from);
      endDate = new Date(req.query.to);
      endDate.setDate(endDate.getDate() + 1); // inclusive end
    } else {
      const days = Math.max(1, Math.min(365, parseInt(req.query.days ?? '30', 10)));
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);
    }

    // Filter daily totals
    const dailyData = history.totals?.daily ?? {};
    const daily = Object.entries(dailyData)
      .filter(([date]) => {
        const d = new Date(date);
        return d >= cutoff && d < endDate;
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        cost: data.cost?.total ?? 0,
        saved: data.cost?.saved ?? 0,
        tokens: data.total ?? 0,
        cached: data.cached ?? 0,
        executions: data.executions ?? 0,
      }));

    // Build parent node skeletons
    const SKIP_KEYS = new Set(['version', 'lastUpdated', 'totals']);
    const parentNodes = {};
    for (const p of PARENT_CEREMONIES) {
      parentNodes[p] = { name: p, calls: 0, tokens: 0, cost: 0, cached: 0, saved: 0, stages: [] };
    }
    const orphans = []; // keys that don't map to a known parent

    for (const [key, value] of Object.entries(history)) {
      if (SKIP_KEYS.has(key)) continue;
      if (!value || typeof value !== 'object') continue;

      let totalInput = 0, totalOutput = 0, totalCost = 0, totalExec = 0, totalCached = 0, totalSaved = 0;
      const dailyForKey = value.daily ?? {};
      for (const [date, data] of Object.entries(dailyForKey)) {
        const d = new Date(date);
        if (d >= cutoff && d < endDate) {
          totalInput  += data.input        ?? 0;
          totalOutput += data.output       ?? 0;
          totalCost   += data.cost?.total  ?? 0;
          totalExec   += data.executions   ?? 0;
          totalCached += data.cached       ?? 0;
          totalSaved  += data.cost?.saved  ?? 0;
        }
      }

      if (totalExec === 0 && totalInput === 0 && totalOutput === 0) continue;

      const entry = { name: key, calls: totalExec, tokens: totalInput + totalOutput, cost: totalCost, cached: totalCached, saved: totalSaved };
      const parent = getParentCeremony(key);

      if (parent && parentNodes[parent]) {
        // Don't add a ceremony as a stage of itself — only add sub-stages
        if (key !== parent) {
          parentNodes[parent].stages.push(entry);
        }
        parentNodes[parent].calls   += totalExec;
        parentNodes[parent].tokens  += totalInput + totalOutput;
        parentNodes[parent].cost    += totalCost;
        parentNodes[parent].cached  += totalCached;
        parentNodes[parent].saved   += totalSaved;
      } else {
        orphans.push({ ...entry, stages: [] });
      }
    }

    // Sort stages within each parent by cost desc
    const ceremonies = [
      ...Object.values(parentNodes).filter(c => c.cost > 0 || c.tokens > 0),
      ...orphans,
    ]
      .map(c => ({ ...c, stages: (c.stages || []).sort((a, b) => b.cost - a.cost) }))
      .sort((a, b) => b.cost - a.cost);

    res.json({ daily, ceremonies });
  });

  return router;
}
